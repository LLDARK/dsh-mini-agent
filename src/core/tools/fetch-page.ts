/**
 * core/tools/fetch-page.ts —— 最小可用爬虫工具。
 *
 * 只做三件事：发请求（带超时与 UA）、把 HTML 压成正文、截断到预算内。
 * 后续要扩展成真正的爬虫 agent，替换这个文件的抽取策略即可，agent loop 不用动。
 */
import type { Tool, ToolResult } from "../types";

const USER_AGENT = "Mozilla/5.0 (compatible; AgentHarness/0.1; +https://deepseek.com)";
const MAX_BYTES = 2_000_000;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
};

export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";

  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = stripped
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return { title: title.replace(/\s+/g, " "), text };
}

export const fetchPageTool: Tool = {
  schema: {
    name: "fetch_page",
    description: "抓取一个 http/https 网页，返回标题和去掉标签后的正文（适合继续做摘要或抽取）。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "完整 URL，必须带 http:// 或 https://" },
        max_chars: { type: "number", description: "正文最多返回多少字符，默认 3000" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  async run(args, ctx): Promise<ToolResult> {
    const rawUrl = String(args.url);
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, content: `只支持 http/https，收到：${url.protocol}` };
    }

    const maxChars = Number(args.max_chars ?? 3000);
    const timeout = AbortSignal.timeout(20_000);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

    const response = await fetch(url, {
      redirect: "follow",
      signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const html = buffer.subarray(0, MAX_BYTES).toString("utf8");
    const { title, text } = htmlToText(html);
    const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}\n…（正文已截断）` : text;

    const content = [
      `URL: ${response.url}`,
      `STATUS: ${response.status}`,
      `TITLE: ${title || "(无标题)"}`,
      `BYTES: ${buffer.length}`,
      "---",
      clipped,
    ].join("\n");

    return {
      ok: response.ok,
      content,
      meta: { status: response.status, title, chars: text.length, url: response.url },
    };
  },
};
