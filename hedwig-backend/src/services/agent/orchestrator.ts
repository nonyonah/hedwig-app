import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../../utils/logger';
import {
  type AgentFunctionCall,
  type AgentRunRequest,
  type AgentRunResult,
  type AgentToolResult,
  type AgentToolDefinition,
} from './types';

const logger = createLogger('AgentOrchestrator');

function getAgentModelName(): string {
  return process.env.LLM_GEMINI_CHAT_MODEL || process.env.LLM_GEMINI_MODEL || 'gemini-2.5-flash';
}

function getAgentClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  return new GoogleGenAI({ apiKey });
}

function extractText(response: { text?: string | (() => string) }): string {
  if (typeof response.text === 'function') return response.text();
  if (typeof response.text === 'string') return response.text;
  return '';
}

function toFunctionDeclarations(tools: AgentToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function tryParseStructured<T>(text: string): T | null {
  const normalized = text.trim();
  if (!normalized) return null;

  try {
    return JSON.parse(normalized) as T;
  } catch {
    return null;
  }
}

export class HedwigAgentOrchestrator {
  private readonly client = getAgentClient();

  async run<TStructured = unknown>(request: AgentRunRequest): Promise<AgentRunResult<TStructured>> {
    const contents: Array<Record<string, unknown>> = [
      { role: 'user', parts: [{ text: request.userMessage }] },
    ];
    const maxIterations = request.maxIterations ?? 4;
    const toolCalls: AgentFunctionCall[] = [];
    const toolResults: AgentToolResult[] = [];
    const tools = request.tools ?? [];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await this.client.models.generateContent({
        model: getAgentModelName(),
        contents,
        config: {
          systemInstruction: request.instruction,
          tools: tools.length > 0 ? [{ functionDeclarations: toFunctionDeclarations(tools) }] : undefined,
          responseMimeType: request.responseSchema ? 'application/json' : undefined,
          responseJsonSchema: request.responseSchema,
        },
      });

      const functionCalls = (response.functionCalls ?? []) as AgentFunctionCall[];
      if (functionCalls.length === 0) {
        const text = extractText(response);
        return {
          text,
          structured: request.responseSchema ? tryParseStructured<TStructured>(text) : null,
          toolCalls,
          toolResults,
        };
      }

      toolCalls.push(...functionCalls);

      const modelContent = (response as { candidates?: Array<{ content?: Record<string, unknown> }> }).candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent);
      }

      const responseParts = await Promise.all(functionCalls.map(async (functionCall) => {
        const tool = tools.find((candidate) => candidate.name === functionCall.name);
        if (!tool) {
          logger.warn('Agent attempted unknown tool', { toolName: functionCall.name });
          return {
            functionResponse: {
              name: functionCall.name,
              id: functionCall.id,
              response: {
                error: `Unknown tool: ${functionCall.name}`,
              },
            },
          };
        }

        try {
          const result = await tool.execute(functionCall.args ?? {}, {
            userId: request.userId,
            now: new Date(),
          });
          toolResults.push({ name: functionCall.name, result });
          return {
            functionResponse: {
              name: functionCall.name,
              id: functionCall.id,
              response: { result },
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn('Agent tool execution failed', { toolName: functionCall.name, message });
          return {
            functionResponse: {
              name: functionCall.name,
              id: functionCall.id,
              response: { error: message },
            },
          };
        }
      }));

      contents.push({
        role: 'user',
        parts: responseParts,
      });
    }

    throw new Error(`Agent exceeded ${maxIterations} iterations without producing a final response`);
  }
}

export const hedwigAgentOrchestrator = new HedwigAgentOrchestrator();
