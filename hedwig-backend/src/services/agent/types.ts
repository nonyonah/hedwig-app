export type AgentRole = 'dispatcher' | 'worker';

export interface AgentFunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentToolResult {
  name: string;
  result: unknown;
}

export interface AgentToolExecutionContext {
  userId: string;
  now: Date;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context: AgentToolExecutionContext
  ) => Promise<unknown>;
}

export interface AgentRunRequest {
  userId: string;
  role: AgentRole;
  instruction: string;
  userMessage: string;
  tools?: AgentToolDefinition[];
  responseSchema?: Record<string, unknown>;
  maxIterations?: number;
}

export interface AgentRunResult<TStructured = unknown> {
  text: string;
  structured: TStructured | null;
  toolCalls: AgentFunctionCall[];
  toolResults: AgentToolResult[];
}
