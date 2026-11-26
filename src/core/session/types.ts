/**
 * core/session/types.ts —— 会话事件（event）类型。
 *
 * harness 的会话不是一个 messages 数组，而是一条只追加的事件流：
 * 模型回复、工具结果、上下文压缩、结束原因都作为事件落盘。
 * 好处是崩溃后可以重放、可以分叉、可以随时从事件重新投影出上下文。
 */
import type { ToolCall } from "../types";

export interface EventBase {
  seq: number;
  ts: string;
}

export type AgentEvent = EventBase &
  (
    | { type: "session.start"; goal: string; model: string; workspace: string }
    | { type: "user.message"; text: string }
    | { type: "assistant.message"; text: string; toolCalls: ToolCall[] }
    | { type: "tool.result"; callId: string; name: string; ok: boolean; content: string }
    | { type: "context.compacted"; dropped: number; note: string }
    | {
        type: "turn.end";
        reason: "completed" | "max-turns" | "error";
        turns: number;
        detail?: string;
      }
  );

export type AgentEventType = AgentEvent["type"];

/** 新建事件时不需要自己填 seq / ts，由 Session.append 统一补齐。 */
export type EventDraft<T extends AgentEvent = AgentEvent> = T extends AgentEvent
  ? Omit<T, "seq" | "ts">
  : never;
