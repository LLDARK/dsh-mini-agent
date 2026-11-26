/**
 * core/tools/registry.ts —— 工具注册表。
 *
 * 模型只看得到 schema，真正执行必须经过这里：统一做 JSON 解析、必填校验、
 * 异常兜底，保证「工具炸了」只会变成一条失败结果，而不会掀翻整个 agent loop。
 */
import type { JsonObject, Tool, ToolContext, ToolResult, ToolSchema } from "../types";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.schema.name)) {
      throw new Error(`工具重名：${tool.schema.name}`);
    }
    this.tools.set(tool.schema.name, tool);
    return this;
  }

  get size(): number {
    return this.tools.size;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((tool) => tool.schema);
  }

  async execute(name: string, rawArguments: string, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, content: `未知工具：${name}` };
    }

    let args: JsonObject;
    try {
      args = rawArguments.trim() ? (JSON.parse(rawArguments) as JsonObject) : {};
    } catch (error) {
      return { ok: false, content: `参数不是合法 JSON：${(error as Error).message}` };
    }

    const missing = (tool.schema.parameters.required ?? []).filter(
      (key) => args[key] === undefined || args[key] === null || args[key] === "",
    );
    if (missing.length > 0) {
      return { ok: false, content: `缺少必填参数：${missing.join(", ")}` };
    }

    try {
      return await tool.run(args, ctx);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, content: `工具执行失败：${detail}` };
    }
  }
}
