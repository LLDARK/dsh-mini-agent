/**
 * core/scope/index.ts —— 文件作用域沙箱。
 *
 * 工具能碰什么目录，由 scope 统一裁决。模型给出的路径一律视为不可信输入：
 * 先拼成绝对路径再判断是否落在工作区内，越界直接抛 ScopeViolation。
 */
import { isAbsolute, relative, resolve, sep } from "node:path";

export class ScopeViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolation";
  }
}

export interface Scope {
  readonly root: string;
  resolve(target: string): string;
  relative(absolute: string): string;
  contains(absolute: string): boolean;
}

export function createScope(root: string): Scope {
  const absoluteRoot = resolve(root);

  const contains = (candidate: string): boolean => {
    const normalizedRoot = process.platform === "win32" ? absoluteRoot.toLowerCase() : absoluteRoot;
    const normalizedCandidate = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    return (
      normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep)
    );
  };

  return {
    root: absoluteRoot,
    contains,
    resolve(target: string): string {
      const candidate = isAbsolute(target) ? resolve(target) : resolve(absoluteRoot, target);
      if (!contains(candidate)) {
        throw new ScopeViolation(`路径越界：${target} 不在工作区 ${absoluteRoot} 内`);
      }
      return candidate;
    },
    relative(absolute: string): string {
      return relative(absoluteRoot, absolute).split(sep).join("/");
    },
  };
}
