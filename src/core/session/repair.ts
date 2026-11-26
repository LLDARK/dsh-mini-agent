/**
 * core/session/repair.ts —— 事件流自愈。
 *
 * 真实场景里进程可能在第 N 个工具调用执行到一半时被杀掉，事件流里就留下
 * 一个「有 tool_calls 却没有对应 tool.result」的助手消息。DeepSeek 会直接
 * 报 400（messages 里每个 tool_call_id 都必须有回包），所以每次调用模型前
 * 必须把这些悬空调用补齐。
 */
import type { ToolCall } from "../types";
import type { AgentEvent } from "./types";

export interface DanglingCall {
  callId: string;
  name: string;
  seq: number;
}

export function findDanglingToolCalls(events: readonly AgentEvent[]): DanglingCall[] {
  const answered = new Set<string>();
  for (const event of events) {
    if (event.type === "tool.result") answered.add(event.callId);
  }

  const dangling: DanglingCall[] = [];
  for (const event of events) {
    if (event.type !== "assistant.message") continue;
    for (const call of event.toolCalls as ToolCall[]) {
      if (!answered.has(call.id)) {
        dangling.push({ callId: call.id, name: call.name, seq: event.seq });
      }
    }
  }
  return dangling;
}

/**
 * 返回需要补写的 tool.result 草稿。
 * 不直接写会话，是为了让调用方决定写库时机（AgentLoop 里紧跟执行完的工具之后写）。
 */
export function buildRepairDrafts(
  events: readonly AgentEvent[],
): Array<{ type: "tool.result"; callId: string; name: string; ok: boolean; content: string }> {
  return findDanglingToolCalls(events).map((call) => ({
    type: "tool.result" as const,
    callId: call.callId,
    name: call.name,
    ok: false,
    content: `[repair] 工具 ${call.name} 在上一轮未返回结果（进程中断或异常），按失败占位继续。`,
  }));
}
