/** 文件读写工具：路径一律过 scope 校验，越界直接失败。 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createScope } from "../scope";
import { ScopeViolation } from "../scope";
import type { Tool, ToolResult } from "../types";

export const readFileTool: Tool = {
  schema: {
    name: "read_file",
    description: "读取工作区内的文本文件，返回前 max_chars 个字符。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "相对工作区的文件路径" },
        max_chars: { type: "number", description: "最多返回多少字符，默认 4000" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  async run(args, ctx): Promise<ToolResult> {
    const scope = createScope(ctx.workspace);
    const file = scope.resolve(String(args.path));
    const maxChars = Number(args.max_chars ?? 4000);
    const content = await readFile(file, "utf8");
    const clipped = content.length > maxChars ? `${content.slice(0, maxChars)}\n…（已截断）` : content;
    return { ok: true, content: clipped, meta: { path: scope.relative(file), bytes: Buffer.byteLength(content) } };
  },
};

export const writeFileTool: Tool = {
  schema: {
    name: "write_file",
    description: "把文本写入工作区内的文件（自动创建父目录），用于保存抓取结果或笔记。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "相对工作区的文件路径" },
        content: { type: "string", description: "要写入的完整文本" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  async run(args, ctx): Promise<ToolResult> {
    const scope = createScope(ctx.workspace);
    const file = scope.resolve(String(args.path));
    const content = String(args.content);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
    return {
      ok: true,
      content: `已写入 ${scope.relative(file)}（${Buffer.byteLength(content)} 字节）`,
      meta: { path: scope.relative(file) },
    };
  },
};

export const listDirTool: Tool = {
  schema: {
    name: "list_dir",
    description: "列出工作区内某个目录的直接子项。",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "相对工作区的目录路径，默认 ." } },
      required: [],
      additionalProperties: false,
    },
  },
  async run(args, ctx): Promise<ToolResult> {
    const scope = createScope(ctx.workspace);
    const dir = scope.resolve(String(args.path ?? "."));
    const entries = await readdir(dir, { withFileTypes: true });
    const lines = entries
      .map((entry) => `${entry.isDirectory() ? "d" : "-"} ${entry.name}`)
      .sort()
      .join("\n");
    return { ok: true, content: lines || "(空目录)", meta: { count: entries.length } };
  },
};

export { ScopeViolation };
