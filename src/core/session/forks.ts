/**
 * core/session/forks.ts —— 会话分叉。
 *
 * 从某个位置切一份新会话出来，是 harness 支持「重试这一轮」「换模型再跑一遍」
 * 的基础能力：原会话不动，新会话从同一前缀继续，后续事件互不污染。
 */
import { Session } from "./index";
import type { AgentEvent } from "./types";

export interface ForkOptions {
  dir?: string;
  id?: string;
  /** 只复制到第几条事件（含），默认全部 */
  atSeq?: number;
  /** 改写新会话的 session.start.goal */
  goal?: string;
}

export function forkSession(source: Session, options: ForkOptions = {}): Session {
  const target = Session.open({ dir: options.dir, id: options.id });
  const limit = options.atSeq ?? Number.POSITIVE_INFINITY;

  for (const event of source.all) {
    if (event.seq > limit) break;
    // 复制时重新编号，seq 保持从 1 连续递增
    const { seq: _seq, ts: _ts, ...draft } = event;
    const copy = structuredClone(draft) as AgentEvent;
    if (copy.type === "session.start" && options.goal) {
      copy.goal = options.goal;
    }
    target.append(copy);
  }

  return target;
}
