/**
 * core/agent-loop/index.ts —— agent 主循环，harness 的心脏。
 *
 * 每一轮的固定动作：
 *   准备上下文（读事件 → 投影 → 压缩）→ 调模型 → 记事件
 *   → 有工具调用就逐个执行并回填结果 → 没有就结束。
 * 循环里不保存任何对话状态，所有状态都在 Session 的事件流里，所以随时可以中断重放。
 */
import type { LlmProvider, ToolCall } from "../types";
import { prepareContext, type PrepareOptions } from "../session/preparation";
import { buildRepairDrafts } from "../session/repair";
import { LoopGuard } from "../session/tool-history";
import { Session } from "../session";
import { buildSystemPrompt } from "../system-prompt";
import { ToolRegistry } from "../tools/registry";

export interface AgentLoopOptions {
  provider: LlmProvider;
  registry: ToolRegistry;
  session: Session;
  workspace: string;
  maxTurns?: number;
  maxInputTokens?: number;
  keepRecentMessages?: number;
  log?: (line: string) => void;
  sessionDir?: string;
}

export interface RunResult {
  text: string;
  turns: number;
  toolCalls: number;
  reason: "completed" | "max-turns" | "error";
}

export class AgentLoop {
  private readonly provider: LlmProvider;
  private readonly registry: ToolRegistry;
  private readonly session: Session;
  private readonly workspace: string;
  private readonly maxTurns: number;
  private readonly contextOptions: Omit<PrepareOptions, "systemPrompt">;
  private readonly log: (line: string) => void;
  private readonly guard: LoopGuard;

  constructor(options: AgentLoopOptions) {
    this.provider = options.provider;
    this.registry = options.registry;
    this.session = options.session;
    this.workspace = options.workspace;
    this.maxTurns = options.maxTurns ?? 6;
    this.log = options.log ?? (() => {});
    this.guard = new LoopGuard(2);
    this.contextOptions = {
      maxInputTokens: options.maxInputTokens ?? 12_000,
      keepRecentMessages: options.keepRecentMessages ?? 12,
      foldToolResultChars: 800,
    };
  }

  async run(goal: string): Promise<RunResult> {
    if (this.session.filter("session.start").length === 0) {
      this.session.append({
        type: "session.start",
        goal,
        model: this.provider.name,
        workspace: this.workspace,
      });
    }
    this.session.append({ type: "user.message", text: goal });

    let turns = 0;
    let toolCalls = 0;
    let lastText = "";

    try {
      for (let turn = 1; turn <= this.maxTurns; turn += 1) {
        turns = turn;
        this.repairIfNeeded();

        const prepared = this.prepare();
        this.log(
          `[turn ${turn}] context ${prepared.messages.length} 条消息 / ~${prepared.estimatedTokens} tokens`,
        );

        const reply = await this.provider.chat({
          messages: prepared.messages,
          tools: this.registry.schemas(),
        });

        this.session.append({
          type: "assistant.message",
          text: reply.text,
          toolCalls: reply.toolCalls,
        });
        lastText = reply.text;

        if (reply.text) this.log(`[turn ${turn}] assistant: ${clip(reply.text, 160)}`);

        if (reply.toolCalls.length === 0) {
          this.session.append({ type: "turn.end", reason: "completed", turns });
          return { text: reply.text, turns, toolCalls, reason: "completed" };
        }

        for (const call of reply.toolCalls) {
          await this.executeTool(call);
          toolCalls += 1;
        }
      }

      this.session.append({ type: "turn.end", reason: "max-turns", turns });
      this.log(`[loop] 达到最大轮数 ${this.maxTurns}，停止`);
      return { text: lastText, turns, toolCalls, reason: "max-turns" };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.session.append({ type: "turn.end", reason: "error", turns, detail });
      return { text: lastText, turns, toolCalls, reason: "error" };
    }
  }

  /** 投影 + 预算检查；真的丢了消息才写一条 context.compacted，避免事件流被噪声塞满。 */
  private prepare(): ReturnType<typeof prepareContext> {
    const systemPrompt = buildSystemPrompt({
      workspace: this.workspace,
      tools: this.registry.schemas(),
      maxTurns: this.maxTurns,
      model: this.provider.name,
    });

    const prepared = prepareContext(this.session.all, { systemPrompt, ...this.contextOptions });

    if (prepared.droppedMessages > 0) {
      this.session.append({
        type: "context.compacted",
        dropped: prepared.droppedMessages,
        note: `折叠 ${prepared.foldedMessages} 条工具结果，丢弃 ${prepared.droppedMessages} 条最老消息`,
      });
      this.log(`[context] 压缩：丢弃 ${prepared.droppedMessages} 条历史消息`);
    }

    return prepared;
  }

  private repairIfNeeded(): void {
    const drafts = buildRepairDrafts(this.session.all);
    for (const draft of drafts) {
      this.session.append(draft);
      this.log(`[repair] 补齐悬空工具调用 ${draft.callId}（${draft.name}）`);
    }
  }

  private async executeTool(call: ToolCall): Promise<void> {
    if (this.guard.observe(call)) {
      const content = `[loop-guard] 检测到重复调用：${call.name} 参数与上一轮完全相同，本次跳过。请换一种做法或直接给出结论。`;
      this.session.append({ type: "tool.result", callId: call.id, name: call.name, ok: false, content });
      this.log(`[tool] ${call.name} 重复调用，已拦截`);
      return;
    }

    this.log(`[tool] → ${call.name} ${clip(call.arguments, 140)}`);
    const result = await this.registry.execute(call.name, call.arguments, {
      workspace: this.workspace,
      sessionId: this.session.id,
    });

    this.session.append({
      type: "tool.result",
      callId: call.id,
      name: call.name,
      ok: result.ok,
      content: result.content,
    });
    this.log(`[tool] ← ${call.name} ${result.ok ? "ok" : "failed"} ${result.content.length} 字符`);
  }
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
