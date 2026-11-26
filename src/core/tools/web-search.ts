/**
 * core/tools/web-search.ts —— 联网搜索工具（对齐 DeepSeek 官方 Search API）。
 *
 * 对应老师给出的文档：POST https://api.deepseek.com/v1/tools/search
 * 使用与 DeepSeek 对话相同的 Bearer 鉴权，返回结构化结果（标题 / 链接 / 摘要 / 正文）。
 * 工具只负责取数，是否调用由 agent loop 里的模型决定。
 */
import type { Tool, ToolResult } from "../types";

const SEARCH_URL = "https://api.deepseek.com/v1/tools/search";

interface SearchHit {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  date?: string;
  site_name?: string | null;
  rerank_score?: number;
}

export const webSearchTool: Tool = {
  schema: {
    name: "web_search",
    description:
      "联网搜索实时网页信息。返回标题、链接、摘要和网页正文，适合查最新事件、事实核查、查找资料。需要外部信息时优先用它，不要凭记忆编造。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索词，1-128 个 Unicode 字符。支持 site:、-、\"精确短语\"、after:、before:、lang: 等语法。",
        },
        count: { type: "number", description: "返回结果条数，1-50，默认 5。" },
        ori_question: { type: "string", description: "触发搜索的用户原始问题，帮助理解搜索意图，可选。" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },

  async run(args, ctx): Promise<ToolResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
    if (!apiKey) {
      return { ok: false, content: "缺少 DEEPSEEK_API_KEY，无法调用 Search API" };
    }

    const query = String(args.query ?? "").trim();
    if (!query) {
      return { ok: false, content: "query 不能为空" };
    }
    const count = Math.min(50, Math.max(1, Number(args.count ?? 5)));
    const body: Record<string, unknown> = { query, count, need_content: true };
    if (args.ori_question) {
      body.ori_question = String(args.ori_question).slice(0, 128);
    }

    const timeout = AbortSignal.timeout(40_000);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

    try {
      const response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        return { ok: false, content: `Search API ${response.status}: ${raw.slice(0, 300)}` };
      }

      const data = JSON.parse(raw) as { results?: SearchHit[] };
      const hits = data.results ?? [];
      const content = hits
        .map((hit, i) => {
          const lines = [
            `[${i + 1}] ${hit.title ?? "(无标题)"}`,
            `URL: ${hit.url ?? ""}`,
            `站点: ${hit.site_name ?? "未知"}   日期: ${hit.date ?? "未知"}`,
            `摘要: ${hit.summary ?? hit.snippet ?? ""}`,
            `正文: ${String(hit.content ?? "").slice(0, 2000) || "(无正文)"}`,
          ];
          return lines.join("\n");
        })
        .join("\n\n");

      return {
        ok: true,
        content: content || "搜索完成，但没有匹配结果。",
        meta: { count: hits.length, engine: "deepseek-search" },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, content: `Search API 调用失败: ${detail}` };
    }
  },
};
