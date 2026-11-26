/**
 * core/session/tool-history.ts —— 工具调用历史。
 *
 * 两个用途：
 *   1) 统计（每个工具调了几次、成功几次、返回多少字节），跑完能直接看调用画像；
 *   2) 死循环保护：同名同参数连续调用两轮以上，说明模型在原地打转，需要干预。
 */
import type { ToolCall } from "../types";
import type { AgentEvent } from "./types";

export interface ToolHistoryEntry {
  name: string;
  calls: number;
  ok: number;
  failed: number;
  bytes: number;
}

export function summarizeToolHistory(events: readonly AgentEvent[]): ToolHistoryEntry[] {
  const map = new Map<string, ToolHistoryEntry>();
  for (const event of events) {
    if (event.type !== "tool.result") continue;
    const entry = map.get(event.name) ?? { name: event.name, calls: 0, ok: 0, failed: 0, bytes: 0 };
    entry.calls += 1;
    entry.bytes += Buffer.byteLength(event.content, "utf8");
    if (event.ok) entry.ok += 1;
    else entry.failed += 1;
    map.set(event.name, entry);
  }
  return [...map.values()].sort((a, b) => b.calls - a.calls);
}

/** 把一次调用压成签名，用于判断「是不是又在做同一件事」。 */
export function signatureOf(call: ToolCall): string {
  let normalized = call.arguments.trim();
  try {
    normalized = JSON.stringify(sortKeys(JSON.parse(call.arguments)));
  } catch {
    // 参数不是合法 JSON 时退回原串
  }
  return `${call.name}::${normalized}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

export class LoopGuard {
  private readonly seen = new Map<string, number>();

  constructor(private readonly threshold = 2) {}

  /** 记录一次调用，返回它是否已构成重复循环。 */
  observe(call: ToolCall): boolean {
    const signature = signatureOf(call);
    const count = (this.seen.get(signature) ?? 0) + 1;
    this.seen.set(signature, count);
    return count >= this.threshold;
  }

  reset(): void {
    this.seen.clear();
  }
}
