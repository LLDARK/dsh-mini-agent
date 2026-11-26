/**
 * core/system-prompt/index.ts —— 系统提示词组装。
 *
 * 提示词不是写死的常量，而是由运行期事实拼出来：工作区在哪、有哪些工具、最多几轮、
 * 今天是几号。工具清单直接从注册表生成，新增工具不用再回来改提示词。
 */
import type { ToolSchema } from "../types";

export interface SystemPromptOptions {
  workspace: string;
  tools: ToolSchema[];
  maxTurns: number;
  model: string;
}

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const toolLines = options.tools
    .map((tool) => `- ${tool.name}：${tool.description}`)
    .join("\n");

  return [
    "你是一个运行在本地工作区的自动化 agent，负责把用户的目标拆成可执行的步骤并调用工具完成。",
    "",
    "## 可用工具",
    toolLines,
    "",
    "## 工作规则",
    "1. 需要最新信息或外部网页时，先用 web_search 搜索，必要时再用 web_fetch 读取原文；不要凭空编造网页内容。",
    `2. 所有文件操作都必须使用相对路径，且只能落在工作区 ${options.workspace} 内。`,
    "3. 一次只做一件明确的事：抓取、阅读、写入分步进行，每步等工具返回后再决定下一步。",
    `4. 你最多有 ${options.maxTurns} 轮工具调用机会，请在预算内结束任务。`,
    "5. 不要在同一个工具上用完全相同的参数反复调用；失败时改变策略或如实报告。",
    "",
    "## 输出要求",
    "- 需要工具时直接发起 tool call，不要在正文里描述 JSON。",
    "- 任务完成后用中文给出结论：做了什么、得到什么、结果保存在哪个文件。",
    "- 结论控制在 200 字以内，不要复述工具的原始输出。",
    "",
    `## 运行环境`,
    `- 模型：${options.model}`,
    `- 日期：${new Date().toISOString().slice(0, 10)}`,
    `- 平台：${process.platform}`,
  ].join("\n");
}
