/** 内置工具集合：一个函数装配完，CLI 与测试都从这里取。 */
import { ToolRegistry } from "./registry";
import { listDirTool, readFileTool, writeFileTool } from "./fs-tools";
import { fetchPageTool } from "./fetch-page";
import { webSearchTool } from "./web-search";
import { webFetchTool } from "./web-fetch";

export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(webSearchTool)
    .register(webFetchTool)
    .register(fetchPageTool)
    .register(writeFileTool)
    .register(readFileTool)
    .register(listDirTool);
}

export { ToolRegistry };
