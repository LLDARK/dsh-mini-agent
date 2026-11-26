/**
 * core/tools/web-fetch.ts —— 网页抓取工具（对齐 DeepSeek 官方 Fetch API）。
 *
 * 对应老师给出的文档：POST https://api.deepseek.com/v1/tools/fetch
 * 输入一个 URL，返回页面标题与 Markdown 正文。与 search 共享同一套 Bearer 鉴权。
 * 典型链路：模型先用 web_search 找到 URL，再用 web_fetch 读取原文。
 */
import type { Tool, ToolResult } from "../types";

const FETCH_URL = "https://api.deepseek.com/v1/tools/fetch";

export const webFetchTool: Tool = {
  schema: {
    name: "web_fetch",
    description:
      "抓取指定网页并返回标题和 Markdown 正文。适合阅读 web_search 找到的具体页面、提取文章原文。URL 必须是完整的 http/https 地址。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的完整网页地址，必须带 http:// 或 https://。" },
        max_chars: { type: "number", description: "正文最多返回多少字符，默认 6000。" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },

  async run(args, ctx): Promise<ToolResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
    if (!apiKey) {
      return { ok: false, content: "缺少 DEEPSEEK_API_KEY，无法调用 Fetch API" };
    }

    const rawUrl = String(args.url ?? "").trim();
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { ok: false, content: `URL 不合法: ${rawUrl}` };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, content: `只支持 http/https，收到: ${parsed.protocol}` };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, content: "URL 不允许携带用户名或密码" };
    }

    const maxChars = Math.min(20_000, Math.max(200, Number(args.max_chars ?? 6000)));
    const timeout = AbortSignal.timeout(40_000);
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

    try {
      const response = await fetch(FETCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ url: parsed.toString() }),
        signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        return { ok: false, content: `Fetch API ${response.status}: ${raw.slice(0, 300)}` };
      }

      const data = JSON.parse(raw) as { title?: string; content?: string };
      const body = String(data.content ?? "");
      const clipped = body.length > maxChars ? `${body.slice(0, maxChars)}\n…（正文已截断）` : body;

      return {
        ok: body.length > 0,
        content: `URL: ${parsed.toString()}\nTITLE: ${data.title ?? "(无标题)"}\nCHARS: ${body.length}\n---\n${clipped || "(页面没有可提取的正文)"}`,
        meta: { title: data.title ?? "", chars: body.length, engine: "deepseek-fetch" },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, content: `Fetch API 调用失败: ${detail}` };
    }
  },
};
