import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../utils/logger';
import { AsyncLimiter } from '../utils/asyncLimiter';

const logger = createLogger('LLM');

const SUPPORTED_PROVIDERS = ['gemini', 'openai'] as const;
export type LLMProvider = (typeof SUPPORTED_PROVIDERS)[number];

type LLMPurpose = 'general' | 'chat' | 'contract' | 'proposal';

export interface LLMFilePart {
  mimeType: string;
  data: string; // base64 payload
}

export interface GenerateTextOptions {
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  purpose?: LLMPurpose;
  useFallbacks?: boolean;
  forceProvider?: LLMProvider;
  files?: LLMFilePart[];
}

export interface GenerateObjectOptions extends GenerateTextOptions {
  schema: Record<string, unknown>;
}

function normalizeProvider(value?: string | null): LLMProvider | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if ((SUPPORTED_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as LLMProvider;
  }
  return null;
}

function parseProviders(csv?: string | null): LLMProvider[] {
  if (!csv) return [];
  const unique: LLMProvider[] = [];
  for (const raw of csv.split(',')) {
    const provider = normalizeProvider(raw);
    if (provider && !unique.includes(provider)) {
      unique.push(provider);
    }
  }
  return unique;
}

export class LLMService {
  private readonly outboundLimiter = new AsyncLimiter(
    Number(process.env.LLM_MAX_CONCURRENT_REQUESTS || 8),
    Number(process.env.LLM_MAX_QUEUE_SIZE || 400)
  );

  private readonly openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  private readonly genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  constructor() {
    if (!this.isAnyProviderConfigured()) {
      logger.warn('No LLM API keys configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY.');
    }
  }

  isProviderConfigured(provider: LLMProvider): boolean {
    if (provider === 'openai') return !!this.openai;
    return !!this.genAI;
  }

  isAnyProviderConfigured(): boolean {
    return this.isProviderConfigured('gemini') || this.isProviderConfigured('openai');
  }

  getConfiguredProviders(): LLMProvider[] {
    return SUPPORTED_PROVIDERS.filter((provider) => this.isProviderConfigured(provider));
  }

  private getPrimaryProvider(): LLMProvider {
    return normalizeProvider(process.env.LLM_PROVIDER) ?? 'gemini';
  }

  private getFallbackProviders(primary: LLMProvider): LLMProvider[] {
    const fromEnv = parseProviders(process.env.LLM_FALLBACK_PROVIDERS);
    if (fromEnv.length > 0) {
      return fromEnv.filter((provider) => provider !== primary);
    }

    // Sensible default: whichever provider is not primary.
    return SUPPORTED_PROVIDERS.filter((provider) => provider !== primary);
  }

  private getProviderOrder(forceProvider?: LLMProvider, useFallbacks = true): LLMProvider[] {
    if (forceProvider) {
      return useFallbacks
        ? [forceProvider, ...this.getFallbackProviders(forceProvider)]
        : [forceProvider];
    }

    const primary = this.getPrimaryProvider();
    if (!useFallbacks) {
      return [primary];
    }
    return [primary, ...this.getFallbackProviders(primary)];
  }

  private getOpenAIModel(): string {
    return process.env.LLM_OPENAI_MODEL || 'gpt-4o-mini';
  }

  private getGeminiModelName(purpose: LLMPurpose): string {
    if (purpose === 'chat') {
      return process.env.LLM_GEMINI_CHAT_MODEL || process.env.LLM_GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    }
    return process.env.LLM_GEMINI_MODEL || 'gemini-2.5-flash-lite';
  }

  private getGeminiClient(): GoogleGenAI {
    if (!this.genAI) {
      throw new Error('Gemini provider is not configured');
    }
    return this.genAI;
  }

  private extractGeminiText(response: { text?: string | (() => string) }): string {
    if (typeof response.text === 'function') {
      return response.text();
    }
    if (typeof response.text === 'string') {
      return response.text;
    }
    return '';
  }

  private async generateWithOpenAI(prompt: string, options: GenerateTextOptions): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI provider is not configured');
    }

    if (options.files && options.files.length > 0) {
      logger.warn('OpenAI provider path received file attachments; proceeding with text-only request', {
        fileCount: options.files.length,
      });
    }

    const messages = options.systemPrompt
      ? [
          { role: 'system' as const, content: options.systemPrompt },
          { role: 'user' as const, content: prompt },
        ]
      : [{ role: 'user' as const, content: prompt }];

    const completion = await this.outboundLimiter.run(() =>
      this.openai!.chat.completions.create({
        model: this.getOpenAIModel(),
        messages,
        temperature: options.temperature,
        max_tokens: options.maxOutputTokens,
      })
    );

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('OpenAI returned an empty response');
    }

    return content;
  }

  private async generateWithGemini(prompt: string, options: GenerateTextOptions): Promise<string> {
    const client = this.getGeminiClient();
    const combinedPrompt = options.systemPrompt
      ? prompt
      : prompt;

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: combinedPrompt },
      ...((options.files ?? []).map((file) => ({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data,
        },
      }))),
    ];

    const result = await this.outboundLimiter.run(() =>
      client.models.generateContent({
        model: this.getGeminiModelName(options.purpose || 'general'),
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: options.systemPrompt,
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
        },
      })
    );

    const text = this.extractGeminiText(result);
    if (!text.trim()) {
      throw new Error('Gemini returned an empty response');
    }

    return text;
  }

  async generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const providerOrder = this.getProviderOrder(options.forceProvider, options.useFallbacks !== false);
    let lastError: Error | null = null;

    for (const provider of providerOrder) {
      if (!this.isProviderConfigured(provider)) {
        continue;
      }

      try {
        if (provider === 'openai') {
          return await this.generateWithOpenAI(prompt, options);
        }
        return await this.generateWithGemini(prompt, options);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;
        logger.warn('LLM provider failed', {
          provider,
          purpose: options.purpose || 'general',
          message: err.message,
        });
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('No configured LLM provider available');
  }

  async generateObject<T>(prompt: string, options: GenerateObjectOptions): Promise<T> {
    const client = this.getGeminiClient();
    const response = await this.outboundLimiter.run(() =>
      client.models.generateContent({
        model: this.getGeminiModelName(options.purpose || 'general'),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: options.systemPrompt,
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: options.schema,
        },
      })
    );

    const text = this.extractGeminiText(response).trim();
    if (!text) {
      throw new Error('Gemini returned an empty structured response');
    }

    return JSON.parse(text) as T;
  }
}

export const llmService = new LLMService();
