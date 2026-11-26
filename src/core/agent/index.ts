/**
 * core/agent/index.ts —— 门面。
 *
 * 把「会话 + 工具 + 模型 + 循环」装配成一个对象，外部（CLI、测试、将来的爬虫任务脚本）
 * 只需要 createAgent(...).run(目标)，不关心内部有几个模块。
 */
import { join } from "node:path";
import { AgentLoop, type RunResult } from "../agent-loop";
import { DeepSeekProvider } from "../llm/client";
import { ScriptedProvider, type ScriptStep } from "../llm/scripted";
import { Session } from "../session";
import { createDefaultRegistry } from "../tools";
import type { LlmProvider } from "../types";

export interface CreateAgentOptions {
  workspace?: string;
  provider?: LlmProvider;
  sessionId?: string;
  sessionDir?: string;
  maxTurns?: number;
  log?: (line: string) => void;
}

export interface Agent {
  readonly session: Session;
  run(goal: string): Promise<RunResult>;
}

export function createAgent(options: CreateAgentOptions = {}): Agent {
  const workspace = options.workspace ?? process.cwd();
  const sessionDir = options.sessionDir ?? join(workspace, ".harness", "sessions");
  const session = Session.open({
    id: options.sessionId,
    dir: sessionDir,
    workspace,
  });

  const loop = new AgentLoop({
    provider: options.provider ?? createProvider("deepseek"),
    registry: createDefaultRegistry(),
    session,
    workspace,
    maxTurns: options.maxTurns,
    log: options.log,
  });

  return { session, run: (goal: string) => loop.run(goal) };
}

export function createProvider(kind: "deepseek" | "scripted", steps: ScriptStep[] = []): LlmProvider {
  return kind === "scripted" ? new ScriptedProvider(steps) : new DeepSeekProvider();
}
