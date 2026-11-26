import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Session } from "../src/core/session";
import { projectEvents } from "../src/core/session/surface";
import { buildRepairDrafts, findDanglingToolCalls } from "../src/core/session/repair";
import { prepareContext, estimateTokens } from "../src/core/session/preparation";
import { forkSession } from "../src/core/session/forks";
import { createScope, ScopeViolation } from "../src/core/scope";
import { LoopGuard } from "../src/core/session/tool-history";

const tempSession = (): Session => {
  const dir = mkdtempSync(join(tmpdir(), "harness-session-"));
  return Session.open({ dir });
};

test("会话是只追加的事件流，seq 连续且落盘可回放", () => {
  const dir = mkdtempSync(join(tmpdir(), "harness-session-"));
  const session = Session.open({ dir, id: "s_test" });
  session.append({ type: "session.start", goal: "g", model: "m", workspace: "/w" });
  session.append({ type: "user.message", text: "你好" });

  assert.equal(session.size, 2);
  assert.deepEqual(session.all.map((e) => e.seq), [1, 2]);

  const reopened = Session.open({ dir, id: "s_test" });
  assert.equal(reopened.size, 2);
  assert.equal(reopened.all[1]?.type, "user.message");
});

test("surface 把事件投影成 OpenAI 兼容消息，工具结果按 callId 回填", () => {
  const session = tempSession();
  session.append({ type: "session.start", goal: "g", model: "m", workspace: "/w" });
  session.append({ type: "user.message", text: "抓取页面" });
  session.append({
    type: "assistant.message",
    text: "",
    toolCalls: [{ id: "call_1", name: "fetch_page", arguments: '{"url":"https://example.com"}' }],
  });
  session.append({ type: "tool.result", callId: "call_1", name: "fetch_page", ok: true, content: "hello" });

  const { messages } = projectEvents(session.all);
  assert.equal(messages.length, 3);
  assert.equal(messages[1]?.tool_calls?.[0]?.id, "call_1");
  assert.equal(messages[2]?.role, "tool");
  assert.equal(messages[2]?.tool_call_id, "call_1");
});

test("repair 能为中断留下的悬空 tool_call 补占位结果", () => {
  const session = tempSession();
  session.append({ type: "user.message", text: "go" });
  session.append({
    type: "assistant.message",
    text: "",
    toolCalls: [
      { id: "call_a", name: "fetch_page", arguments: "{}" },
      { id: "call_b", name: "write_file", arguments: "{}" },
    ],
  });
  session.append({ type: "tool.result", callId: "call_a", name: "fetch_page", ok: true, content: "ok" });

  const dangling = findDanglingToolCalls(session.all);
  assert.deepEqual(dangling.map((d) => d.callId), ["call_b"]);

  const drafts = buildRepairDrafts(session.all);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.ok, false);
});

test("上下文超预算时按组丢弃，不会留下孤立 tool 消息", () => {
  const session = tempSession();
  session.append({ type: "user.message", text: "第一轮" });
  session.append({
    type: "assistant.message",
    text: "",
    toolCalls: [{ id: "c1", name: "read_file", arguments: "{}" }],
  });
  session.append({ type: "tool.result", callId: "c1", name: "read_file", ok: true, content: "x".repeat(2000) });
  session.append({ type: "assistant.message", text: "第一轮结束", toolCalls: [] });
  session.append({ type: "user.message", text: "第二轮" });

  const prepared = prepareContext(session.all, {
    systemPrompt: "sys",
    maxInputTokens: 120,
    keepRecentMessages: 2,
    foldToolResultChars: 400,
  });

  assert.ok(prepared.estimatedTokens <= 400);
  assert.equal(prepared.messages[0]?.role, "system");
  const firstNonSystem = prepared.messages.find((m) => m.role !== "system");
  assert.notEqual(firstNonSystem?.role, "tool");
});

test("scope 拦住 ../ 逃逸，放行工作区内路径", () => {
  const scope = createScope(process.cwd());
  const inside = scope.resolve("out/result.md");
  assert.ok(inside.startsWith(scope.root));
  assert.throws(() => scope.resolve("../../etc/passwd"), ScopeViolation);
});

test("LoopGuard 在同参重复调用时熔断", () => {
  const guard = new LoopGuard(2);
  const call = { id: "1", name: "fetch_page", arguments: '{"url":"https://a.com"}' };
  assert.equal(guard.observe(call), false);
  assert.equal(guard.observe({ ...call, id: "2" }), true);
});

test("fork 复制到指定位置并重新编号", () => {
  const session = tempSession();
  session.append({ type: "user.message", text: "a" });
  session.append({ type: "user.message", text: "b" });
  const forked = forkSession(session, { atSeq: 1, goal: "分支" });
  assert.equal(forked.size, 1);
  assert.deepEqual(forked.all.map((e) => e.seq), [1]);
});

test("token 估算对中文与英文都给出非零值", () => {
  assert.ok(estimateTokens("抓取网页") >= 4);
  assert.ok(estimateTokens("hello world") >= 2);
});
