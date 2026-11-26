import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AgentLoop } from "../src/core/agent-loop";
import { ScriptedProvider, callTool, say } from "../src/core/llm/scripted";
import { Session } from "../src/core/session";
import { createDefaultRegistry } from "../src/core/tools";

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-loop-"));
  writeFileSync(join(dir, "data.txt"), "第一行\n第二行\n", "utf8");
  return dir;
}

test("agent loop：模型发起工具调用 → 工具执行 → 模型收尾", async () => {
  const workspace = makeWorkspace();
  const session = Session.open({ dir: join(workspace, ".harness", "sessions"), workspace });
  const provider = new ScriptedProvider([
    callTool("call_1", "read_file", { path: "data.txt" }),
    say("文件共两行，已读取完毕。"),
  ]);

  const loop = new AgentLoop({
    provider,
    registry: createDefaultRegistry(),
    session,
    workspace,
    maxTurns: 4,
  });

  const result = await loop.run("读取 data.txt 并告诉我有几行");
  assert.equal(result.reason, "completed");
  assert.equal(result.turns, 2);
  assert.equal(result.toolCalls, 1);
  assert.match(result.text, /两行/);

  const toolResults = session.filter("tool.result");
  assert.equal(toolResults.length, 1);
  assert.match(toolResults[0]!.content, /第一行/);

  // 第二次请求模型时，上下文里必须已经带上工具结果
  const secondRequest = provider.requests[1]!;
  const toolMessage = secondRequest.messages.find((m) => m.role === "tool");
  assert.ok(toolMessage, "工具结果没有进入上下文");
});

test("agent loop：越界路径被 scope 拒绝，失败结果仍然回到模型", async () => {
  const workspace = makeWorkspace();
  const session = Session.open({ dir: join(workspace, ".harness", "sessions"), workspace });
  const provider = new ScriptedProvider([
    callTool("call_1", "read_file", { path: "../../../etc/passwd" }),
    say("越界读取被拒绝，已停止。"),
  ]);

  const loop = new AgentLoop({
    provider,
    registry: createDefaultRegistry(),
    session,
    workspace,
    maxTurns: 3,
  });

  await loop.run("读一下系统密码文件");
  const toolResults = session.filter("tool.result");
  assert.equal(toolResults.length, 1);
  assert.equal(toolResults[0]!.ok, false);
  assert.match(toolResults[0]!.content, /越界/);
});

test("agent loop：模型一直调用工具时在 maxTurns 处停下", async () => {
  const workspace = makeWorkspace();
  const session = Session.open({ dir: join(workspace, ".harness", "sessions"), workspace });
  const provider = new ScriptedProvider([
    callTool("c1", "list_dir", { path: "." }),
    callTool("c2", "list_dir", { path: "sub" }),
    callTool("c3", "list_dir", { path: "sub2" }),
  ]);

  const loop = new AgentLoop({
    provider,
    registry: createDefaultRegistry(),
    session,
    workspace,
    maxTurns: 2,
  });

  const result = await loop.run("不停列目录");
  assert.equal(result.reason, "max-turns");
  assert.equal(result.turns, 2);
});
