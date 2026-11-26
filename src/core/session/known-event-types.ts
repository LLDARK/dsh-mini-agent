/**
 * core/session/known-event-types.ts —— 事件类型注册表。
 * 新增事件类型时必须同步登记，否则 surface / 统计逻辑无从判断它该怎么投影。
 */
import type { AgentEventType } from "./types";

export interface EventTypeSpec {
  /** 该事件在上下文中投影成什么，用于阅读与自检 */
  projectsTo: "user-message" | "assistant-message" | "tool-message" | "none";
  description: string;
}

export const KNOWN_EVENT_TYPES: Record<AgentEventType, EventTypeSpec> = {
  "session.start": {
    projectsTo: "none",
    description: "会话元信息（目标、模型、工作区），只作记录，不进上下文",
  },
  "user.message": { projectsTo: "user-message", description: "用户输入" },
  "assistant.message": {
    projectsTo: "assistant-message",
    description: "模型回复，可能携带一个或多个工具调用",
  },
  "tool.result": { projectsTo: "tool-message", description: "工具执行结果，按 callId 回填" },
  "context.compacted": {
    projectsTo: "none",
    description: "上下文压缩记录：丢掉了多少条事件、压缩说明",
  },
  "turn.end": { projectsTo: "none", description: "一次 run 的结束原因与轮数" },
};

export function assertKnownEventType(type: string): asserts type is AgentEventType {
  if (!(type in KNOWN_EVENT_TYPES)) {
    throw new Error(`未登记的事件类型：${type}`);
  }
}
