/**
 * core/llm/scripted.ts —— 脚本化模型。
 *
 * 单元测试不能依赖外网与随机输出，所以把模型回复写成固定序列。
 * 它和 DeepSeekProvider 实现同一个 LlmProvider 接口，agent loop 完全无感知。
 */
import type { LlmProvider, LlmReply, LlmRequest } from "../types";

export type ScriptStep = LlmReply | ((req: LlmRequest, index: number) => LlmReply);

export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";
  private index = 0;
  readonly requests: LlmRequest[] = [];

  constructor(private readonly steps: ScriptStep[]) {}

  async chat(req: LlmRequest): Promise<LlmReply> {
    this.requests.push(structuredClone(req));
    const step = this.steps[this.index];
    if (!step) {
      throw new Error(`脚本已用尽（第 ${this.index + 1} 次调用）`);
    }
    this.index += 1;
    return typeof step === "function" ? step(req, this.index) : structuredClone(step);
  }
}

/** 构造一次工具调用的便捷函数 */
export function callTool(id: string, name: string, args: Record<string, unknown>): LlmReply {
  return { text: "", toolCalls: [{ id, name, arguments: JSON.stringify(args) }] };
}

export function say(text: string): LlmReply {
  return { text, toolCalls: [] };
}
