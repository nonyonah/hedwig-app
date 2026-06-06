import { GoogleGenAI } from '@google/genai';
import { generateText } from 'ai';
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
  return process.env.LLM_GATEWAY_MODEL || 'google/gemini-2.5-flash-lite';
}

function buildGeminiParts(prompt: string, files?: LLMFilePart[]): any[] {
  const parts: any[] = [];
  parts.push({ text: prompt });
  if (files) {
    for (const f of files) {
      parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
    }
  }
  return parts;
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
  private readonly gatewayConfigured = !!process.env.AI_GATEWAY_API_KEY;
  private readonly configured = !!this.gemini || this.gatewayConfigured;

  constructor() {
    if (!this.configured) {
      logger.warn('LLM not configured. Set GEMINI_API_KEY and/or AI_GATEWAY_API_KEY.');
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

  private async generateWithGemini(
    prompt: string,
    options: GenerateTextOptions,
  ): Promise<string> {
    if (!this.gemini) throw new Error('Gemini is not configured');

    const result = await this.outboundLimiter.run(() =>
      this.gemini!.models.generateContent({
        model: getModel(),
        contents: [{ role: 'user', parts: buildGeminiParts(prompt, options.files) }],
        config: buildGeminiConfig(options),
      }),
    );

    const text = result.text;
    if (!text || !text.trim()) {
      throw new Error('Gemini returned an empty response');
    }
    return text;
  }

  private async generateWithGateway(
    prompt: string,
    options: GenerateTextOptions,
  ): Promise<string> {
    const hasFiles = options.files && options.files.length > 0;
    const messages: { role: 'user'; content: any }[] = [];

    if (hasFiles) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...options.files!.map((f) => ({
            type: 'image' as const,
            image: f.data,
          })),
        ],
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const result = await this.outboundLimiter.run(() =>
      generateText({
        model: getGatewayModel(),
        system: options.systemPrompt,
        messages,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      }),
    );

    if (!result.text || !result.text.trim()) {
      throw new Error('Gateway returned an empty response');
    }
    return result.text;
  }

  async generateText(
    prompt: string,
    options: GenerateTextOptions = {},
  ): Promise<string> {
    if (!this.configured) throw new Error('No configured LLM provider available');

    if (this.gemini) {
      try {
        return await this.generateWithGemini(prompt, options);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn('Gemini failed, falling back to AI Gateway', { message: err.message });
      }
    }

    if (this.gatewayConfigured) {
      return this.generateWithGateway(prompt, options);
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

    let messages: any[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];

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
