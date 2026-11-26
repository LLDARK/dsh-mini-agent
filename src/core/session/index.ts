/**
 * core/session/index.ts —— 会话本体：只追加的事件日志。
 *
 * 每条事件同步写入 .harness/sessions/<id>.jsonl 一行，写完即可在崩溃后重放；
 * 内存里同时保留一份，供 surface 投影使用。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { assertKnownEventType } from "./known-event-types";
import type { AgentEvent, EventDraft } from "./types";

export interface SessionOptions {
  /** 会话 id，省略则自动生成；分叉 / 续跑时显式传入 */
  id?: string;
  /** 事件文件目录，默认 <cwd>/.harness/sessions */
  dir?: string;
  /** 目标描述，仅用于 session.start */
  goal?: string;
  model?: string;
  workspace?: string;
}

export class Session {
  readonly id: string;
  readonly file: string;
  private events: AgentEvent[] = [];
  private seq = 0;

  private constructor(id: string, dir: string) {
    this.id = id;
    this.file = join(dir, `${id}.jsonl`);
  }

  /** 打开（或新建）会话；目录里已有同 id 的 jsonl 时会先回放。 */
  static open(options: SessionOptions = {}): Session {
    const dir = options.dir ?? join(process.cwd(), ".harness", "sessions");
    mkdirSync(dir, { recursive: true });
    const id = options.id ?? `s_${randomUUID().slice(0, 8)}`;
    const session = new Session(id, dir);

    if (existsSync(session.file)) {
      session.replay(readFileSync(session.file, "utf8"));
    }
    return session;
  }

  private replay(raw: string): void {
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as AgentEvent;
      assertKnownEventType(event.type);
      this.events.push(event);
      this.seq = Math.max(this.seq, event.seq);
    }
  }

  /** 追加一条事件，返回补齐 seq / ts 后的完整事件。 */
  append(draft: EventDraft): AgentEvent {
    assertKnownEventType(draft.type);
    const event = {
      ...draft,
      seq: this.seq + 1,
      ts: new Date().toISOString(),
    } as AgentEvent;

    this.seq = event.seq;
    this.events.push(event);
    appendFileSync(this.file, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  get all(): readonly AgentEvent[] {
    return this.events;
  }

  get size(): number {
    return this.events.length;
  }

  /** 取指定类型的事件，供测试与统计使用。 */
  filter<T extends AgentEvent["type"]>(type: T): Array<Extract<AgentEvent, { type: T }>> {
    return this.events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);
  }
}
