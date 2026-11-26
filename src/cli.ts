/**
 * cli.ts —— 命令行入口。
 *
 *   npm run crawl -- --task "抓取 https://example.com 并总结这个页面的内容"
 *   npm run demo                      # 交互模式，边输入边跑
 *
 * 只做参数解析与输出美化，所有能力都在 core 里。
 */
import { loadEnv } from "./core/env";
import { createAgent } from "./core/agent";
import { summarizeToolHistory } from "./core/session/tool-history";
import { createInterface } from "node:readline/promises";

interface CliOptions {
  task?: string;
  workspace: string;
  sessionId?: string;
  maxTurns: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { workspace: process.cwd(), maxTurns: 6 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--task":
        options.task = next;
        i += 1;
        break;
      case "--workspace":
        options.workspace = next ?? options.workspace;
        i += 1;
        break;
      case "--session":
        options.sessionId = next;
        i += 1;
        break;
      case "--max-turns":
        options.maxTurns = Number(next ?? options.maxTurns);
        i += 1;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
    }
  }

  // 目标为空或以 -- 开头，多半是命令里重复传了 --task，空转几轮会把 API 额度白白烧掉
  if (options.task !== undefined && (options.task.trim() === "" || options.task.startsWith("--"))) {
    console.error(`非法目标："${options.task}"。请检查命令是否重复传了 --task。`);
    process.exit(2);
  }

  return options;
}

function printHelp(): void {
  console.log(`agent-harness core v0.1

用法:
  tsx src/cli.ts --task "<目标>" [--max-turns 6] [--workspace .] [--session <id>]

示例:
  tsx src/cli.ts --task "抓取 https://example.com 并总结页面内容，保存到 out/example.md"`);
}

function banner(options: CliOptions, model: string): void {
  const line = "─".repeat(60);
  console.log(`┌${line}`);
  console.log(`│ agent-harness core · 最小实现`);
  console.log(`│ provider : ${model}`);
  console.log(`│ workspace: ${options.workspace}`);
  console.log(`│ maxTurns : ${options.maxTurns}`);
  console.log(`└${line}`);
}

async function main(): Promise<void> {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const providerName = process.env.DEEPSEEK_API_KEY ? "deepseek:deepseek-chat" : "未配置 API Key";
  banner(options, providerName);

  const agent = createAgent({
    workspace: options.workspace,
    sessionId: options.sessionId,
    maxTurns: options.maxTurns,
    log: (line) => console.log(line),
  });

  const goals: string[] = [];
  if (options.task) {
    goals.push(options.task);
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let closed = false;
    rl.on("close", () => { closed = true; });
    for (;;) {
      if (closed) break;
      let input: string;
      try {
        input = (await rl.question("\n目标> ")).trim();
      } catch (error) {
        if ((error as Error).name === "AbortError") break;
        throw error;
      }
      if (!input || input === "exit" || input === "quit") break;
      goals.push(input);
      await runOnce(agent, input);
      goals.pop();
    }
    if (!closed) rl.close();
    return;
  }

  for (const goal of goals) {
    await runOnce(agent, goal);
  }
}

async function runOnce(agent: ReturnType<typeof createAgent>, goal: string): Promise<void> {
  console.log(`\n[goal] ${goal}\n`);
  const started = Date.now();
  const result = await agent.run(goal);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[result] ${result.reason} · ${result.turns} 轮 · ${result.toolCalls} 次工具调用 · ${elapsed}s`);
  console.log(`[final ] ${result.text || "(模型未给出文字结论)"}`);

  const history = summarizeToolHistory(agent.session.all);
  if (history.length > 0) {
    console.log(`\n[tools ]`);
    for (const entry of history) {
      console.log(
        `  ${entry.name.padEnd(12)} calls=${entry.calls} ok=${entry.ok} failed=${entry.failed} bytes=${entry.bytes}`,
      );
    }
  }
  console.log(`[session] ${agent.session.size} 条事件 → ${agent.session.file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
