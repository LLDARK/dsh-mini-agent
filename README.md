# agent-harness core（DeepSeek Harness 最小形态）

对 DeepSeek Harness（`dsh`）核心运行机制的一份最小实现：把**模型 + 工具 + 会话 + 循环**跑到能真实完成联网检索任务，并支持命令行聊天。

## 已实现的能力

| 能力 | 对应模块 |
|---|---|
| Agent 主循环：模型发起工具调用 → 执行 → 结果回灌 → 收尾 | `src/core/agent-loop/index.ts` |
| 只追加事件流（会话落盘、回放、压缩、分叉、修复悬空调用） | `src/core/session/` |
| 工具注册表：schema 生成、参数校验、异常兜底 | `src/core/tools/registry.ts` |
| **web_search**：DeepSeek 官方 Search API，联网搜索 | `src/core/tools/web-search.ts` |
| **web_fetch**：DeepSeek 官方 Fetch API，抓取网页转 Markdown | `src/core/tools/web-fetch.ts` |
| fetch_page / read_file / write_file / list_dir（带工作区沙箱） | `src/core/tools/` |
| 插件式装配：`createAgent()` 门面替换 provider 即可换模型 | `src/core/agent/index.ts` |
| 命令行交互聊天（`npm run demo`，输入 `exit` 退出） | `src/cli.ts` |

联网工具对接老师给出的官方文档：
- Search：`POST https://api.deepseek.com/v1/tools/search`
- Fetch：`POST https://api.deepseek.com/v1/tools/fetch`
- 均使用与 DeepSeek 对话相同的 Bearer 鉴权，按成功请求计费。

## 运行

```bash
export PATH=/usr/local/nodejs/bin:$PATH   # 本机 node 不在默认 PATH 时需要
npm install
cp .env.example .env                       # 填入自己的 DEEPSEEK_API_KEY
npm run typecheck                          # 类型检查
npm test                                   # 11 个单测
npm run crawl -- --task "搜索 DeepSeek 最新消息并总结"   # 单次任务
npm run demo                               # 交互式命令行聊天
```

演示时也可以直接：

```bash
npx tsx src/cli.ts --task "先用 web_search 搜索 X，再用 web_fetch 打开搜索结果的第一条链接，最后总结原文" --max-turns 6
```

## 目录结构

```
src/
  core/
    types.ts                 公共契约
    env.ts                   .env 加载器
    llm/                     DeepSeek 客户端 + 测试用脚本化模型
    session/                 事件流、投影、压缩、修复、分叉
    tools/                   工具注册 + web_search / web_fetch / 文件工具
    scope/                   工作区路径沙箱
    system-prompt/           运行期系统提示词
    agent-loop/              主循环（核心）
    agent/                   门面
  cli.ts                     命令行入口
tests/                       11 个 node:test 单测
```

## 设计取舍

- **事件是事实，消息是视图**：`Session` 只追加事件，`projectEvents()` 负责投影；压缩、分叉、UI 都读同一份事件。
- **配对不可破**：`assistant.tool_calls` 与 `tool.tool_call_id` 必须成对，中断留下的悬空调用由 `repair.ts` 补占位。
- **工具失败不掀桌**：`ToolRegistry.execute` 把异常收敛成 `ok:false` 的结果，模型能看到原因并改变策略。
- **联网工具与模型解耦**：Search/Fetch 以普通 Tool 实现，agent loop 不感知具体 API；换 provider 或换搜索引擎只改对应文件。
- **不信任模型自律**：同参重复调用由 `LoopGuard` 熔断，轮数由 `maxTurns` 兜底。

## 安全

`.env` 已加入 `.gitignore`，API Key 不会进仓库。提交前请确认 `git status` 里没有 `.env`。
