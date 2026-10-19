/**
 * URL 生成工具
 * 为生成的文件提供可访问的 URL
 */

import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { AgentToolResult, AgentToolUpdateCallback } from "@originos/pi-agent-adapter";
import type { ToolRegistration } from "../types";
import { getToolContext } from "./context";
import path from "path";
import { getDataRoot } from '../../../paths';

// ============================================================================
// 工具执行辅助
// ============================================================================

interface ToolExecutionContext {
  toolCallId: string;
  toolName: string;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<unknown>;
}

function createToolContext(
  toolCallId: string,
  toolName: string,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<unknown>
): ToolExecutionContext {
  return { toolCallId, toolName, signal, onUpdate };
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Tool execution was aborted", "AbortError");
  }
}

function logToolStart(ctx: ToolExecutionContext, params: Record<string, unknown>): void {
  console.info(`[Tool:${ctx.toolName}] START_CALL_ID=${ctx.toolCallId}`, JSON.stringify(params, null, 2));
}

function logToolEnd(ctx: ToolExecutionContext, result: Record<string, unknown>): void {
  console.info(`[Tool:${ctx.toolName}] END_CALL_ID=${ctx.toolCallId}`, JSON.stringify(result, null, 2));
}

// ============================================================================
// 工具: 生成文件访问 URL
// ============================================================================

const GenerateFileUrlParamsSchema = Type.Object({
  filePath: Type.String({
    description: "文件路径（相对于当前工作目录或绝对路径）",
  }),
  baseUrl: Type.Optional(Type.String({
    description: "基础 URL（默认使用当前域名）",
  })),
});

/**
 * 生成文件访问 URL 工具。
 *
 * @deprecated OriginOS 文件内容统一通过 open_file 打开，不再向 Agent 暴露本工具。
 *
 * 将生成的文件转换为可通过 HTTP 访问的 URL
 * 支持的文件类型：图片、PDF、JSON、文本等
 */
const GenerateFileUrlTool: ToolRegistration = {
  name: "generate_file_url",
  label: "生成文件访问 URL",
  description: "为生成的文件创建可通过 HTTP 访问的 URL。支持图片、PDF、JSON 等文件类型。返回完整的访问地址，用户可以直接在浏览器中打开。",
  parameters: GenerateFileUrlParamsSchema,
  category: "system",
  enabled: false,
  async execute(
    toolCallId: string,
    params: Static<typeof GenerateFileUrlParamsSchema>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<unknown>
  ): Promise<AgentToolResult<unknown>> {
    const ctx = createToolContext(toolCallId, "generate_file_url", signal, onUpdate);

    try {
      logToolStart(ctx, params);
      checkAbort(ctx.signal);

      const toolContext = getToolContext();
      const cwd = getDataRoot();
      const portableInputPath = params.filePath.replace(/\\/gu, '/');

      // 解析文件路径（统一用 path.resolve 确保得到绝对路径）
      let absolutePath: string;
      if (path.isAbsolute(params.filePath)) {
        absolutePath = params.filePath;
      } else if (portableInputPath.startsWith('data/')) {
        absolutePath = path.resolve(cwd, portableInputPath.slice('data/'.length));
      } else if (portableInputPath.startsWith('skills/') || portableInputPath.startsWith('tmp/')) {
        absolutePath = path.resolve(cwd, portableInputPath);
      } else {
        const baseDir = toolContext.workingDirectory || cwd;
        absolutePath = path.resolve(baseDir, params.filePath);
      }

      // getDataRoot() 已经是 data/ 目录；所有其下文件都允许生成访问 URL。
      const relativePath = path.relative(cwd, absolutePath);
      if (
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      ) {
        throw new Error(`File must be under project directory. Got: ${absolutePath}`);
      }

      const urlRelativePath = relativePath.split(path.sep).join('/');

      // 构建静态资源 URL（使用 /api/files/ 直接返回二进制流）
      const baseUrl = params.baseUrl || "http://localhost:3000";
      const apiUrl = `${baseUrl}/api/files/${urlRelativePath}`;

      // 获取文件扩展名
      const ext = path.extname(params.filePath).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.tiff', '.tif', '.avif'].includes(ext);

      const result = {
        success: true,
        url: apiUrl,
        filePath: absolutePath,
        relativePath: urlRelativePath,
        fileType: isImage ? "image" : "file",
        extension: ext,
      };

      logToolEnd(ctx, result);

      // 直接返回 URL，方便 LLM 使用
      const message = isImage
        ? `文件 URL: ${apiUrl}\n\n这是一个图片文件，可以直接在浏览器中打开，或在前端使用 <img src="${apiUrl}" /> 显示。`
        : `文件 URL: ${apiUrl}\n\n可以直接在浏览器中打开或下载。`;

      return {
        content: [{
          type: "text" as const,
          text: message,
        }],
        details: result,
      };
    } catch (error) {
      console.error(`[Tool:generate_file_url] ERROR_CALL_ID=${toolCallId}`, error);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        }],
        details: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
};

// ============================================================================
// 导出
// ============================================================================

export const urlTools: ToolRegistration[] = [
  GenerateFileUrlTool,
];
