/**
 * core/session/preparation.ts —— 上下文准备（预算 + 压缩）。
 *
 * 长会话不可能无限塞进模型窗口，这里做两级处理：
 *   1) 折叠：最近窗口之外的超长工具结果只保留头尾；
 *   2) 丢弃：仍超预算就从最老的消息开始丢，但绝不把 tool 消息和它的 assistant 拆开。
 */
import type { ChatMessage } from "../types";
import type { AgentEvent } from "./types";
import { projectEvents } from "./surface";

/** 粗略 token 估算：CJK 按 1 字 1 token，其余按 4 字符 1 token。够用且不引依赖。 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (char.codePointAt(0)! > 0x2e80) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export interface PrepareOptions {
  systemPrompt: string;
  /** 输入预算（token），超过就压缩 */
  maxInputTokens: number;
  /** 最近多少条消息原样保留 */
  keepRecentMessages: number;
  /** 折叠后单条工具结果保留的字符数 */
  foldToolResultChars: number;
}

export interface PreparedContext {
  messages: ChatMessage[];
  estimatedTokens: number;
  foldedMessages: number;
  droppedMessages: number;
}

function fold(message: ChatMessage, keep: number): ChatMessage {
  if (message.role !== "tool") return message;
  if (message.content.length <= keep) return message;
  const head = message.content.slice(0, Math.floor(keep / 2));
  const tail = message.content.slice(-Math.floor(keep / 4));
  return {
    ...message,
    content: `${head}\n…（已折叠 ${message.content.length - head.length - tail.length} 字符）…\n${tail}`,
  };
}

function countTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 6, 0);
}

export function prepareContext(
  events: readonly AgentEvent[],
  options: PrepareOptions,
): PreparedContext {
  const projected = projectEvents(events).messages;

  let foldedMessages = 0;
  const windowStart = Math.max(0, projected.length - options.keepRecentMessages);
  const folded = projected.map((message, index) => {
    if (index >= windowStart) return message;
    const next = fold(message, options.foldToolResultChars);
    if (next !== message) foldedMessages += 1;
    return next;
  });

  // 把「assistant + 它的若干 tool 回包」捆成不可拆的组，丢弃只能按组进行，
  // 否则会出现「有 tool_calls 但没有 tool 回包」的非法上下文。
  const groups: ChatMessage[][] = [];
  for (const message of folded) {
    const current = groups[groups.length - 1];
    const currentHasToolCalls = current?.some(
      (item) => item.role === "assistant" && (item.tool_calls?.length ?? 0) > 0,
    );
    if (message.role === "tool" && currentHasToolCalls) {
      current!.push(message);
    } else {
      groups.push([message]);
    }
  }

  const budget = options.maxInputTokens - estimateTokens(options.systemPrompt);
  let droppedMessages = 0;
  while (groups.length > 1 && countTokens(groups.flat()) > budget) {
    droppedMessages += groups.shift()!.length;
  }

  const kept = groups.flat();

  const messages: ChatMessage[] = [{ role: "system", content: options.systemPrompt }, ...kept];

  return {
    messages,
    estimatedTokens: countTokens(messages),
    foldedMessages,
    droppedMessages,
  };
}
