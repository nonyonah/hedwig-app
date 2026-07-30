import { GoogleGenAI } from '@google/genai';
import { generateText } from 'ai';
import OpenAI from 'openai';
import { createLogger } from '../utils/logger';
import { AsyncLimiter } from '../utils/asyncLimiter';

const logger = createLogger('LLM');

type LLMPurpose = 'general' | 'chat' | 'contract' | 'proposal';

export interface LLMFilePart {
  mimeType: string;
  data: string;
}

export interface GenerateTextOptions {
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  purpose?: LLMPurpose;
  files?: LLMFilePart[];
  provider?: 'auto' | 'gemini' | 'gateway' | 'openrouter';
}

export interface GenerateObjectOptions extends GenerateTextOptions {
  schema: Record<string, unknown>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  name: string;
  id: string;
  args: Record<string, unknown>;
}

export interface LLMToolResult {
  name: string;
  result: unknown;
}

export interface GenerateWithToolsOptions {
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  maxIterations?: number;
  conversationHistory?: { role: string; content: string }[];
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function getModel(): string {
  return process.env.LLM_MODEL || 'gemini-2.5-flash-lite';
}

function getGatewayModel(): string {
  return process.env.LLM_GATEWAY_MODEL || 'xiaomi/mimo-v2.5';
}

function buildGeminiConfig(options: GenerateTextOptions, extra?: Record<string, unknown>): any {
  const config: any = {};
  if (options.systemPrompt) config.systemInstruction = options.systemPrompt;
  if (options.temperature !== undefined) config.temperature = options.temperature;
  if (options.maxOutputTokens !== undefined) config.maxOutputTokens = options.maxOutputTokens;
  if (extra) Object.assign(config, extra);
  return config;
}

export class LLMService {
  private readonly outboundLimiter = new AsyncLimiter(
    Number(process.env.LLM_MAX_CONCURRENT_REQUESTS || 8),
    Number(process.env.LLM_MAX_QUEUE_SIZE || 400),
  );

  private readonly gemini = getGeminiClient();
  private readonly gatewayConfigured = !!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL_AUTH_TOKEN;
  private readonly openRouterConfigured = !!process.env.OPENROUTER_API_KEY;
  private readonly configured = !!this.gemini || this.gatewayConfigured || this.openRouterConfigured;

  constructor() {
    if (!this.configured) {
      logger.warn('LLM not configured. Set AI_GATEWAY_API_KEY, VERCEL_AUTH_TOKEN, or OPENROUTER_API_KEY.');
    }
  }

  isAnyProviderConfigured(): boolean {
    return this.configured;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  isGeminiConfigured(): boolean {
    return !!this.gemini;
  }

  isGatewayConfigured(): boolean {
    return this.gatewayConfigured;
  }

  isOpenRouterConfigured(): boolean {
    return this.openRouterConfigured;
  }

  private async generateWithGateway(
    prompt: string,
    options: GenerateTextOptions,
  ): Promise<string> {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) throw new Error('AI Gateway is not configured');

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
    });

    const model = process.env.LLM_GATEWAY_MODEL || getGatewayModel();
    const hasFiles = options.files && options.files.length > 0;

    // Gateway only supports image/* files via OpenAI endpoint — PDFs fall through to OpenRouter
    if (hasFiles && options.files!.some((f) => !f.mimeType.startsWith('image/'))) {
      throw new Error('AI Gateway only supports image file parts — falling through');
    }
    const system = options.systemPrompt;

    const result = await this.outboundLimiter.run(async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

      if (system) {
        messages.push({ role: 'system', content: system });
      }

      if (hasFiles) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...options.files!.map((f) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${f.mimeType};base64,${f.data}` },
            })),
          ],
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxOutputTokens ?? 4096,
      });

      return res.choices?.[0]?.message?.content || '';
    });

    if (!result || !result.trim()) {
      throw new Error('AI Gateway returned an empty response');
    }
    return result;
  }

  private async generateWithOpenRouter(
    prompt: string,
    options: GenerateTextOptions,
  ): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OpenRouter is not configured');

    const hasFiles = options.files && options.files.length > 0;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite';

    const messages: { role: string; content: any }[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    if (hasFiles) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...options.files!.map((f) => ({
            type: 'image_url',
            image_url: { url: `data:${f.mimeType};base64,${f.data}` },
          })),
        ],
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const result = await this.outboundLimiter.run(async () => {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://hedwig.app',
          'X-Title': 'Hedwig',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxOutputTokens ?? 2000,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json() as any;
      return json.choices?.[0]?.message?.content || '';
    });

    if (!result || !result.trim()) {
      throw new Error('OpenRouter returned an empty response');
    }
    return result;
  }


  async generateText(
    prompt: string,
    options: GenerateTextOptions = {},
  ): Promise<string> {
    if (!this.configured) throw new Error('No configured LLM provider available');

    const provider = options.provider || 'auto';

    const providers: { key: string; label: string; fn: () => Promise<string>; check: () => boolean }[] = [];

    if (provider === 'gateway' || provider === 'auto') {
      providers.push({
        key: 'gateway', label: 'AI Gateway',
        fn: () => this.generateWithGateway(prompt, options),
        check: () => this.gatewayConfigured,
      });
    }

    if (provider === 'openrouter' || provider === 'auto') {
      providers.push({
        key: 'openrouter', label: 'OpenRouter',
        fn: () => this.generateWithOpenRouter(prompt, options),
        check: () => this.openRouterConfigured,
      });
    }

    for (const p of providers) {
      if (!p.check()) continue;
      try {
        return await p.fn();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn(`${p.label} failed, trying next provider`, { message: err.message });
      }
    }

    throw new Error('No configured LLM provider available');
  }

  async generateObject<T>(
    prompt: string,
    options: GenerateObjectOptions,
  ): Promise<T> {
    const text = await this.generateText(prompt, options);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Failed to parse structured response as JSON');
    }
  }

  async generateWithTools(
    prompt: string,
    tools: LLMToolDefinition[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    options: GenerateWithToolsOptions = {},
  ): Promise<{ text: string; toolCalls: LLMToolCall[]; toolResults: LLMToolResult[] }> {
    const maxIterations = options.maxIterations ?? 8;
    const toolCalls: LLMToolCall[] = [];
    const toolResults: LLMToolResult[] = [];

    if (this.gemini) {
      try {
        return await this.generateWithToolsGemini(prompt, tools, executeTool, options, maxIterations, toolCalls, toolResults);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn('Gemini tools failed, falling back to AI Gateway', { message: err.message });
      }
    }

    if (this.gatewayConfigured) {
      return await this.generateWithToolsGateway(prompt, tools, executeTool, options, maxIterations, toolCalls, toolResults);
    }

    throw new Error('No configured LLM provider available');
  }

  private async generateWithToolsGemini(
    prompt: string,
    tools: LLMToolDefinition[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    options: GenerateWithToolsOptions,
    maxIterations: number,
    toolCalls: LLMToolCall[],
    toolResults: LLMToolResult[],
  ): Promise<{ text: string; toolCalls: LLMToolCall[]; toolResults: LLMToolResult[] }> {
    if (!this.gemini) throw new Error('Gemini is not configured');

    const contents: any[] = [
      ...(options.conversationHistory ?? []).map((m) => ({
        role: m.role as 'user' | 'model',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ];

    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const config: any = buildGeminiConfig(options as any, {
      tools: [{ functionDeclarations }],
    });

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const result = await this.outboundLimiter.run(() =>
        this.gemini!.models.generateContent({
          model: getModel(),
          contents,
          config,
        }),
      );

      const functionCalls = result.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        return { text: result.text || '', toolCalls, toolResults };
      }

      const modelParts: any[] = [];
      if (result.text) modelParts.push({ text: result.text });

      for (const fc of functionCalls) {
        const args = (fc.args || {}) as Record<string, unknown>;
        const tc: LLMToolCall = {
          name: fc.name || '',
          id: fc.id || `${fc.name}-${Date.now()}`,
          args,
        };
        toolCalls.push(tc);

        modelParts.push({
          functionCall: { name: fc.name, args },
        });
      }

      contents.push({ role: 'model', parts: modelParts });

      const userParts: any[] = [];
      for (const fc of functionCalls) {
        try {
          const execResult = await executeTool(fc.name || '', (fc.args || {}) as Record<string, unknown>);
          toolResults.push({ name: fc.name || '', result: execResult });
          userParts.push({
            functionResponse: {
              name: fc.name,
              response: execResult,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          userParts.push({
            functionResponse: {
              name: fc.name,
              response: { error: message },
            },
          });
        }
      }

      contents.push({ role: 'user', parts: userParts });
    }

    throw new Error(`Gemini tools exceeded ${maxIterations} iterations`);
  }

  private async generateWithToolsGateway(
    prompt: string,
    tools: LLMToolDefinition[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    options: GenerateWithToolsOptions,
    maxIterations: number,
    toolCalls: LLMToolCall[],
    toolResults: LLMToolResult[],
  ): Promise<{ text: string; toolCalls: LLMToolCall[]; toolResults: LLMToolResult[] }> {
    const toolSet: Record<string, any> = {};
    for (const t of tools) {
      toolSet[t.name] = {
        description: t.description,
        parameters: t.parameters,
      };
    }

    let messages: any[] = [
      ...(options.conversationHistory ?? []).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [{ type: 'text' as const, text: m.content }],
      })),
      { role: 'user', content: [{ type: 'text', text: prompt }] },
    ];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const result = await this.outboundLimiter.run(() =>
        generateText({
          model: getGatewayModel(),
          system: options.systemPrompt,
          messages,
          tools: toolSet,
        } as any),
      );

      const text = result.text || '';
      const staticCalls = result.staticToolCalls;

      if (!staticCalls || staticCalls.length === 0) {
        return { text, toolCalls, toolResults };
      }

      messages = [
        ...messages,
        ...JSON.parse(JSON.stringify(result.response?.messages ?? [])),
      ];

      for (const tc of staticCalls) {
        const ft: LLMToolCall = {
          name: tc.toolName,
          id: tc.toolCallId,
          args: (tc.input || {}) as Record<string, unknown>,
        };
        toolCalls.push(ft);

        try {
          const execResult = await executeTool(ft.name, ft.args);
          toolResults.push({ name: ft.name, result: execResult });
          messages.push({
            role: 'tool',
            content: [{
              type: 'tool-result',
              toolCallId: ft.id,
              toolName: ft.name,
              output: { type: 'text', value: JSON.stringify(execResult) },
            }],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          messages.push({
            role: 'tool',
            content: [{
              type: 'tool-result',
              toolCallId: ft.id,
              toolName: ft.name,
              output: { type: 'text', value: JSON.stringify({ error: message }) },
            }],
          });
        }
      }
    }

    throw new Error(`Gateway tools exceeded ${maxIterations} iterations`);
  }
}

export const llmService = new LLMService();
