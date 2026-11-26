/**
 * core/env.ts —— 极简 .env 加载器，不引入第三方依赖。
 *
 * 服务器上的密钥放在项目根目录的 .env 里（已加入 .gitignore），
 * 启动时把键值写入 process.env，供 LLM 适配器与联网工具共用。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(file = ".env", cwd = process.cwd()): void {
  const path = resolve(cwd, file);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
