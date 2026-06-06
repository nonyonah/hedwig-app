import {
  type AgentFunctionCall,
  type AgentRunRequest,
  type AgentRunResult,
  type AgentToolResult,
} from './types';
import { llmService, type LLMToolDefinition } from '../llm';

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

  async run<TStructured = unknown>(
    request: AgentRunRequest,
  ): Promise<AgentRunResult<TStructured>> {
    const tools = (request.tools ?? []).map((t): LLMToolDefinition => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const result = await llmService.generateWithTools(
      request.userMessage,
      tools,
      async (name, args) => {
        const toolDef = request.tools?.find((t) => t.name === name);
        if (!toolDef) throw new Error(`Unknown tool: ${name}`);
        return toolDef.execute(args, {
          userId: request.userId,
          now: new Date(),
        });
      },
      {
        systemPrompt: request.instruction,
        maxIterations: request.maxIterations ?? 8,
      },
    );

    const toolCalls: AgentFunctionCall[] = result.toolCalls.map((tc) => ({
      name: tc.name,
      id: tc.id,
      args: tc.args,
    }));

    const toolResults: AgentToolResult[] = result.toolResults.map((tr) => ({
      name: tr.name,
      result: tr.result,
    }));

    return {
      text: result.text || '',
      structured: request.responseSchema
        ? tryParseStructured<TStructured>(result.text || '')
        : null,
      toolCalls,
      toolResults,
    };
  }
}

export const hedwigAgentOrchestrator = new HedwigAgentOrchestrator();
