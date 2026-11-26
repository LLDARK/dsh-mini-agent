/**
 * core/llm/client.ts —— DeepSeek Chat Completions 客户端。
 *
 * 只依赖内置 fetch，不引 SDK：请求体、tool_calls 解析、重试策略都在这里收敛，
 * 换模型（deepseek-chat / deepseek-reasoner / 其他 OpenAI 兼容服务）只改 baseUrl 与 model。
 */
import type { ChatMessage, LlmProvider, LlmReply, LlmRequest, ToolCall } from "../types";

export interface DeepSeekOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface RawCompletion {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: RawToolCall[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class DeepSeekProvider implements LlmProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    if (!apiKey) {
      throw new Error("缺少 DEEPSEEK_API_KEY，无法创建 DeepSeek 提供方");
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
    this.model = options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
    this.temperature = options.temperature ?? 0.2;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.name = `deepseek:${this.model}`;
  }

  async chat(req: LlmRequest, signal?: AbortSignal): Promise<LlmReply> {
    const body = {
      model: this.model,
      messages: req.messages.map(toWireMessage),
      temperature: this.temperature,
      tools: req.tools.map((tool) => ({
        type: "function" as const,
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      tool_choice: req.toolChoice ?? "auto",
      stream: false,
    };

    const payload = await this.post("/chat/completions", body, signal);
    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? "";
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments ?? "{}",
    }));

    return {
      text: content.trim(),
      toolCalls,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<RawCompletion> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: composed,
        });

        const text = await response.text();
        const data = safeParse(text) as RawCompletion;

        if (response.ok) return data;

        // 只有限流与服务端错误值得重试，4xx 参数错误重试也没用
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new Error(
          `DeepSeek ${response.status}: ${data?.error?.message ?? text.slice(0, 300)}`,
        );
        if (!retryable) throw lastError;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (signal?.aborted) throw lastError;
      }

      const waitMs = 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    throw lastError ?? new Error("DeepSeek 调用失败");
  }
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.tool_calls?.length) {
    wire.tool_calls = message.tool_calls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }));
  }
  if (message.tool_call_id) wire.tool_call_id = message.tool_call_id;
  if (message.name) wire.name = message.name;
  return wire;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
