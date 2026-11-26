/**
 * core/session/surface.ts —— 事件流 → 模型上下文。
 *
 * 这是 harness 里最关键的一次「投影」：事件是事实，messages 只是它的一种视图。
 * 同一条事件流可以投影成完整上下文、压缩后的上下文，或喂给 UI 的时间线，互不影响。
 */
import type { ChatMessage, ToolCall } from "../types";
import type { AgentEvent } from "./types";

export interface Surface {
  messages: ChatMessage[];
  /** 被投影丢弃的事件数（不含本身就不进上下文的事件） */
  skipped: number;
}

export function projectEvents(events: readonly AgentEvent[]): Surface {
  const messages: ChatMessage[] = [];
  let skipped = 0;

  for (const event of events) {
    switch (event.type) {
      case "user.message":
        messages.push({ role: "user", content: event.text });
        break;

      case "assistant.message": {
        const message: ChatMessage = { role: "assistant", content: event.text };
        if (event.toolCalls.length > 0) {
          message.tool_calls = event.toolCalls.map((call) => ({ ...call }));
        }
        messages.push(message);
        break;
      }

      case "tool.result":
        messages.push({
          role: "tool",
          tool_call_id: event.callId,
          name: event.name,
          content: event.content,
        });
        break;

      case "session.start":
      case "context.compacted":
      case "turn.end":
        skipped += 1;
        break;
    }
  }

  return { messages, skipped };
}

/** 当前上下文里最后一次工具调用的名字，用于 CLI 展示与幂等判断。 */
export function lastToolCall(events: readonly AgentEvent[]): ToolCall | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === "assistant.message" && event.toolCalls.length > 0) {
      return event.toolCalls[event.toolCalls.length - 1];
    }
  }
  return undefined;
}
