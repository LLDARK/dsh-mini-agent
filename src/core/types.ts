/**
 * core/types.ts —— 整个 harness 的公共类型约定。
 * 设计原则：只有这里定义消息、工具、模型的形状，其他模块一律引用，避免各处各写一套。
 */

export type Role = "system" | "user" | "assistant" | "tool";

export type JsonObject = Record<string, unknown>;

/** 模型请求的一次工具调用。arguments 保留模型返回的原始 JSON 字符串，便于原样回放与排查。 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** 送给 / 来自模型的对话消息（OpenAI 兼容格式，DeepSeek 直接可用）。 */
export interface ChatMessage {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  meta?: JsonObject;
}

export interface ToolContext {
  workspace: string;
  sessionId: string;
  signal?: AbortSignal;
}

export interface Tool {
  readonly schema: ToolSchema;
  run(args: JsonObject, ctx: ToolContext): Promise<ToolResult>;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmRequest {
  messages: ChatMessage[];
  tools: ToolSchema[];
  toolChoice?: "auto" | "none";
}

export interface LlmReply {
  text: string;
  toolCalls: ToolCall[];
  usage?: LlmUsage;
}

/** 模型提供方抽象：真实 DeepSeek 与测试用脚本化模型都实现它，agent loop 不关心是谁。 */
export interface LlmProvider {
  readonly name: string;
  chat(req: LlmRequest, signal?: AbortSignal): Promise<LlmReply>;
}
