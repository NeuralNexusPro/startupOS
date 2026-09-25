/**
 * Bash 执行工具
 * 提供命令行执行能力
 *
 * 参考 Claude Code 的 BashTool 实现：
 * - 动态检测最佳可用 shell（bash/zsh）
 * - 使用 spawn 而非 exec，避免 /bin/sh 路径硬编码
 * - 执行前验证 CWD 是否存在
 * - 从 tool context 获取 skill 工作目录
 */

import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import type { AgentToolResult, AgentToolUpdateCallback } from "@originos/pi-agent-adapter";
import type { ToolRegistration } from "../types";
import { spawn } from "child_process";
import { accessSync, constants } from "fs";
import { delimiter, join, win32 as pathWin32 } from "path";
import { StringDecoder } from "string_decoder";
import { getToolContext } from "./context";
import { getDataRoot } from '../../../paths';
import { hasChannelOfficeCapabilities } from '../channel-office-capabilities';

// ============================================================================
// Shell detection
// ============================================================================

const SUPPORTED_SHELL_NAMES = new Set(["bash", "zsh", "sh"]);

const DEFAULT_SHELL_PATHS = [
  "/bin/bash",
  "/bin/zsh",
  "/usr/bin/bash",
  "/usr/bin/zsh",
  "/usr/local/bin/bash",
  "/usr/local/bin/zsh",
  "/opt/homebrew/bin/bash",
  "/opt/homebrew/bin/zsh",
  "/bin/sh",
];

type ShellInvocationEnv = Record<string, string | undefined>;

/**
 * 是否运行在 Windows 平台。复用 main.ts 的 process.platform 判定模式。
 * Windows 下不依赖 Unix shell，优先用系统原生的 cmd/powershell，避免
 * Git Bash/MSYS 把 Windows 路径改写成 MSYS 风格（如 /workspace、/c/...）。
 */
function isWindowsPlatform(): boolean {
  return process.platform === "win32";
}

/**
 * 在 PATH 环境变量中搜索指定可执行文件，返回首个匹配的绝对路径。
 * 用于 Windows 下定位 powershell.exe / pwsh.exe / bash.exe。
 */
function findExecutableOnPath(name: string): string | null {
  for (const pathDir of (process.env["PATH"] || "").split(delimiter)) {
    if (!pathDir) continue;
    const candidate = join(pathDir, name);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * 在 Windows 上查找可用 shell。
 *
 * 优先级：
 * 1. PowerShell（pwsh.exe 或 powershell.exe，Win10+ 默认含 powershell.exe）—
 *    原生 Windows shell，不会把 Windows 路径改写成 MSYS 风格。
 * 2. cmd.exe（%ComSpec%）— 最原始的 Windows 命令解释器。
 * 3. Git Bash 的 bash.exe（PATH 搜索）— 兼容 SKILL.md 里的 Unix 风格命令，
 *    作为后备；调用方需注入 HOME 避免 MSYS 回退到 /workspace。
 */
function findWindowsShell(): string | null {
  // 1. PowerShell Core (pwsh) → 2. Windows PowerShell
  const pwsh = findExecutableOnPath("pwsh.exe") ?? findExecutableOnPath("pwsh");
  if (pwsh) return pwsh;

  const powershell =
    findExecutableOnPath("powershell.exe") ?? findExecutableOnPath("powershell");
  if (powershell) return powershell;

  // 2. cmd.exe（ComSpec 由 Windows 自动设置）
  const comspec = process.env["ComSpec"];
  if (comspec && isExecutable(comspec)) {
    return comspec;
  }
  const cmd = findExecutableOnPath("cmd.exe") ?? findExecutableOnPath("cmd");
  if (cmd) return cmd;

  // 3. Git Bash 后备
  return findExecutableOnPath("bash.exe") ?? findExecutableOnPath("bash");
}

/**
 * 判断 shell 路径是否为 PowerShell（用于命令构造分支）。
 */
function isPowerShell(shellPath: string): boolean {
  const name = shellName(shellPath).toLowerCase();
  return name === "powershell" || name === "pwsh";
}

/**
 * 判断 shell 路径是否为 cmd.exe。
 */
function isCmdShell(shellPath: string): boolean {
  return shellName(shellPath).toLowerCase() === "cmd";
}

/**
 * 为给定 shell 构造 spawn 参数与额外环境变量。
 *
 * 返回 { shellArgs, env }：
 * - shellArgs：传给 spawn 的第二参数
 * - env：叠加在 process.env 之上的环境变量（Windows Git Bash 需注入 HOME）
 */
function buildShellInvocation(shellPath: string, command: string): {
  shellArgs: string[];
  env: ShellInvocationEnv;
} {
  // Windows PowerShell
  if (isPowerShell(shellPath)) {
    return {
      shellArgs: ["-NoProfile", "-NonInteractive", "-Command", command],
      env: {},
    };
  }

  // Windows cmd.exe
  if (isCmdShell(shellPath)) {
    return {
      shellArgs: ["/d", "/s", "/c", command],
      env: {},
    };
  }

  // Unix bash/zsh 或 Windows Git Bash（bash.exe）
  const isZsh = shellPath.includes("zsh");
  const shellConfig = isZsh ? ".zshrc" : ".bashrc";
  const loadConfigCmd = `[ -f ~/${shellConfig} ] && source ~/${shellConfig} 2>/dev/null || true; `;
  const fullCommand = loadConfigCmd + command;
  const env: ShellInvocationEnv = {};

  // Windows Git Bash 后备：MSYS 在 HOME 未设/异常时会回退到挂载根
  // （常表现为 /workspace），导致 pwd 返回错误路径。这里显式注入 HOME。
  if (isWindowsPlatform()) {
    const home = process.env["USERPROFILE"] || process.env["HOME"];
    if (home) {
      env["HOME"] = home;
    }
    // 阻止 MSYS2 自动转换命令行参数里的 Windows 路径，避免语义被改写
    env["MSYS2_ARG_CONV_EXCL"] = "*";
  }

  return {
    shellArgs: ["-c", fullCommand],
    env,
  };
}

/**
 * 查找最佳可用 shell
 * 参考 claude-code Shell.ts 的 findSuitableShell() 实现
 * 1. 检查 SHELL 环境变量
 * 2. 按优先级搜索常见路径
 */
export function findSuitableShell(): string | null {
  // Windows：优先原生 cmd/powershell，避免 MSYS 路径改写
  if (isWindowsPlatform()) {
    return findWindowsShell();
  }

  // 检查用户首选 shell
  const envShell = resolveShellFromEnv(process.env["SHELL"]);
  if (envShell) {
    return envShell;
  }

  // 按优先级搜索常见路径
  for (const shellPath of DEFAULT_SHELL_PATHS) {
    if (isExecutable(shellPath)) {
      return shellPath;
    }
  }

  return null;
}

/**
 * 从环境变量解析 shell 候选项。
 * 兼容 "zsh bash"、"zsh,bash"、"/bin/zsh" 这类配置，避免把整串当成可执行文件。
 */
function resolveShellFromEnv(value?: string): string | null {
  if (!value) return null;

  for (const candidate of parseShellCandidates(value)) {
    const resolved = resolveShellCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function parseShellCandidates(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((candidate) => candidate.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function resolveShellCandidate(candidate: string): string | null {
  if (!isEnvShellSupported(candidate)) {
    return null;
  }

  if (candidate.includes("/") && isExecutable(candidate)) {
    return candidate;
  }

  const candidateName = shellName(candidate);
  for (const shellPath of DEFAULT_SHELL_PATHS) {
    if (shellName(shellPath) === candidateName && isExecutable(shellPath)) {
      return shellPath;
    }
  }

  for (const pathDir of (process.env["PATH"] || "").split(delimiter)) {
    if (!pathDir) continue;
    const shellPath = join(pathDir, candidateName);
    if (isExecutable(shellPath)) {
      return shellPath;
    }
  }

  return null;
}

function shellName(shellPath: string): string {
  // 同时处理 / 和 \ 分隔符，避免非 Windows 平台用 basename 解析
  // Windows 路径（如 C:\...\pwsh.exe）时取不到正确的末段文件名。
  const segs = shellPath.split(/[\\/]/);
  const last = segs[segs.length - 1] ?? shellPath;
  return last.replace(/\.(exe|cmd)$/i, "");
}

/**
 * 检查路径是否可执行
 */
function isExecutable(shellPath: string): boolean {
  try {
    accessSync(shellPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查环境变量是否是支持的 shell
 */
function isEnvShellSupported(envShell: string): boolean {
  return SUPPORTED_SHELL_NAMES.has(shellName(envShell));
}

// ============================================================================
// CWD validation and resolution
// ============================================================================

/**
 * 解析工作目录
 * 工作目录由 agent-manager 统一解析后通过 tool context 传入
 * 工具层不关心来源，只使用该值
 */
async function resolveWorkingDirectory(
  paramsWorkingDirectory?: string,
): Promise<string> {
  // 优先使用 tool context 中的 workingDirectory（由 agent-manager 设置）
  // 使用 getEffectiveWorkingDirectory 解决多个 agent 系统共享 defaultContext 的问题
  const effectiveDir = getToolContext().workingDirectory;
  if (effectiveDir) {
    return effectiveDir;
  }

  // 其次使用参数中的 workingDirectory（LLM 调用时可能传入）
  if (paramsWorkingDirectory) {
    // Windows 绝对路径（C:\）或 Unix 绝对路径（/）直接使用，不拼接 dataRoot
    if (pathWin32.isAbsolute(paramsWorkingDirectory) || paramsWorkingDirectory.startsWith("/")) {
      return paramsWorkingDirectory;
    }
    return `${getDataRoot()}/${paramsWorkingDirectory}`;
  }

  // 回退到可写的数据目录（打包后为 ~/Library/Application Support/.../data）
  return getDataRoot();
}

// ============================================================================
// 工具执行辅助函数
// ============================================================================

interface ToolExecutionCtx {
  toolCallId: string;
  toolName: string;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<unknown>;
}

const MAX_CAPTURED_OUTPUT_CHARS = 64 * 1024;
const OUTPUT_TAIL_CHARS = 16 * 1024;
const LOG_PREVIEW_CHARS = 240;

function updateHash(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next;
}

function formatHash(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(/\b(?:sk|tp)-[A-Za-z0-9._-]{8,}\b/gu, "[REDACTED]")
    .replace(
      /\b(api[_-]?key|token|secret|password)(\s*[:=]\s*["']?)[^\s,"'}]+/giu,
      "$1$2[REDACTED]",
    );
}

class BoundedTextBuffer {
  private readonly headLimit: number;
  private readonly tailLimit: number;
  private head = "";
  private tail = "";
  private totalLength = 0;
  private hash = 2166136261;

  constructor(
    maxChars = MAX_CAPTURED_OUTPUT_CHARS,
    tailChars = OUTPUT_TAIL_CHARS,
  ) {
    this.tailLimit = Math.min(Math.max(tailChars, 0), maxChars);
    this.headLimit = Math.max(0, maxChars - this.tailLimit);
  }

  append(value: string): void {
    if (!value) return;
    this.totalLength += value.length;
    this.hash = updateHash(this.hash, value);

    let remaining = value;
    if (this.head.length < this.headLimit) {
      const available = this.headLimit - this.head.length;
      this.head += remaining.slice(0, available);
      remaining = remaining.slice(available);
    }
    if (remaining && this.tailLimit > 0) {
      this.tail = (this.tail + remaining).slice(-this.tailLimit);
    }
  }

  result(): {
    text: string;
    originalLength: number;
    hash: string;
    truncated: boolean;
  } {
    const retained = this.head.length + this.tail.length;
    const truncated = this.totalLength > retained;
    const marker = truncated
      ? `\n...[output truncated, omittedChars=${this.totalLength - retained}]...\n`
      : "";
    return {
      text: `${this.head}${marker}${this.tail}`,
      originalLength: this.totalLength,
      hash: formatHash(this.hash),
      truncated,
    };
  }
}

function summarizeText(value: string, maxPreview = LOG_PREVIEW_CHARS): string {
  const normalized = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  const preview = normalized.slice(0, maxPreview);
  return `length=${value.length}, hash=${formatHash(updateHash(2166136261, value))}, preview=${JSON.stringify(preview)}`;
}

function createToolCtx(
  toolCallId: string,
  toolName: string,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<unknown>,
): ToolExecutionCtx {
  return { toolCallId, toolName, signal, onUpdate };
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Tool execution was aborted", "AbortError");
  }
}

function logToolStart(
  ctx: ToolExecutionCtx,
  params: Record<string, unknown>,
): void {
  if (process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] === "1") {
    return;
  }
  const command = typeof params["command"] === "string" ? params["command"] : "";
  const workingDirectory = typeof params["workingDirectory"] === "string"
    ? params["workingDirectory"]
    : "context-default";
  const timeout = typeof params["timeout"] === "number" ? params["timeout"] : 30000;
  console.info(
    `[Tool:${ctx.toolName}] START_CALL_ID=${ctx.toolCallId} command(${summarizeText(command)}), workingDirectory=${JSON.stringify(workingDirectory)}, timeout=${timeout}`,
  );
}

function logToolEnd(
  ctx: ToolExecutionCtx,
  result: Record<string, unknown>,
): void {
  const exitCode = typeof result["exitCode"] === "number" ? result["exitCode"] : undefined;
  const failed = result["success"] === false || (exitCode !== undefined && exitCode !== 0);
  const message = `[Tool:${ctx.toolName}] ${failed ? "ERROR" : "END"}_CALL_ID=${ctx.toolCallId}${exitCode !== undefined ? ` exitCode=${exitCode}` : ""}`;
  const stdout = typeof result["stdout"] === "string" ? result["stdout"] : "";
  const stderr = typeof result["stderr"] === "string" ? result["stderr"] : "";
  const summary = `${message} stdout(${summarizeText(stdout)}), stderr(${summarizeText(stderr)})`;
  if (failed) {
    console.error(summary);
  } else if (process.env["ORIGINOS_WORKER_STDOUT_JSON_LINE"] !== "1") {
    console.info(summary);
  }
}

function logToolError(ctx: ToolExecutionCtx, error: unknown): void {
  console.error(
    `[Tool:${ctx.toolName}] ERROR_CALL_ID=${ctx.toolCallId}`,
    error,
  );
}

function sendProgress(
  ctx: ToolExecutionCtx,
  message: string,
  progress?: number,
  data?: unknown,
): void {
  if (!ctx.onUpdate || ctx.signal?.aborted) return;

  ctx.onUpdate({
    content: [{ type: "text" as const, text: message }],
    details: {
      type: "progress",
      toolCallId: ctx.toolCallId,
      toolName: ctx.toolName,
      status: "in_progress",
      message,
      progress,
      data,
      timestamp: Date.now(),
    },
  });
}

// ============================================================================
// 安全检查
// ============================================================================

/**
 * 危险命令黑名单
 */
const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "mkfs",
  "dd if=",
  ":(){:|:&};:", // fork bomb
  "chmod -R 777 /",
  "chown -R",
  "> /dev/sda",
  "mv /* /dev/null",
];

/**
 * 危险命令模式
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/(?!data)/, // 允许删除 /data 目录下的内容
  /rm\s+-rf\s+~\//,
  /rm\s+-rf\s+\*/,
  />\s*\/dev\/sd[a-z]/,
  /dd\s+if=/,
  /mkfs/,
  /format\s+[a-z]:/i,
];

/**
 * 检查命令是否安全
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  if (hasChannelOfficeCapabilities() && /(^|[\s;&|()])(?:[^\s;&|()]*[/\\])?wecom-cli(?:\s|$)/i.test(command)) {
    return {
      safe: false,
      reason: '当前 IM 会话必须使用 discover_im_capabilities / invoke_im_capability，以保持企微连接和授权身份一致',
    };
  }
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (command.includes(dangerous)) {
      return { safe: false, reason: `命令包含危险操作: ${dangerous}` };
    }
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `命令匹配危险模式: ${pattern}` };
    }
  }

  return { safe: true };
}

// ============================================================================
// 工具: 执行命令
// ============================================================================

const ExecuteCommandParamsSchema = Type.Object({
  command: Type.String({
    minLength: 1,
    description: "要执行的命令",
  }),
  workingDirectory: Type.Optional(
    Type.String({
      description: "工作目录（绝对路径或相对于项目根目录的路径）",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: "超时时间（毫秒），默认 30000",
      default: 30000,
      maximum: 300000, // 最大 5 分钟
    }),
  ),
});

const ExecuteCommandTool: ToolRegistration = {
  name: "execute_command",
  label: "执行命令",
  description:
    "执行 shell 命令并返回结果。注意：出于安全考虑，某些危险命令会被拒绝执行。",
  parameters: ExecuteCommandParamsSchema,
  category: "system",
  enabled: true,
  async execute(
    toolCallId: string,
    params: Static<typeof ExecuteCommandParamsSchema>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<unknown>,
  ): Promise<AgentToolResult<unknown>> {
    const ctx = createToolCtx(toolCallId, "execute_command", signal, onUpdate);

    try {
      logToolStart(ctx, params);
      checkAbort(ctx.signal);

      // 安全检查
      const safetyCheck = isCommandSafe(params.command);
      if (!safetyCheck.safe) {
        throw new Error(`安全检查失败: ${safetyCheck.reason}`);
      }

      sendProgress(ctx, `准备执行命令: ${params.command.slice(0, LOG_PREVIEW_CHARS)}`, 0.2);

      // 解析工作目录（支持 tool context 中的 skill base dir）
      const cwd = await resolveWorkingDirectory(params.workingDirectory);

      // 动态查找 shell
      const shellPath = findSuitableShell();
      if (!shellPath) {
        throw new Error(
          "No suitable shell found. Please ensure bash or zsh is installed.",
        );
      }

      // 设置超时
      const timeout = params.timeout || 30000;

      sendProgress(ctx, `执行中...`, 0.5);

      // 构造 shell 调用参数与运行环境
      // - Unix (bash/zsh)：加载 ~/.zshrc 或 ~/.bashrc，让 nvm/brew 安装的 node/python 可用
      // - Windows PowerShell/cmd：跳过 source（Windows 无此机制），用 -NoProfile 避免拖慢启动
      // - Windows Git Bash 后备：注入 HOME（取自 USERPROFILE），避免 MSYS 回退到 /workspace
      const { shellArgs, env: shellEnv } = buildShellInvocation(shellPath, params.command);

      const envVars = {
        ...process.env,
        CLAUDECODE: "1",
        ...shellEnv,
      } as NodeJS.ProcessEnv;

      // 使用 spawn 执行命令（参考 Claude Code 的实现）
      const child = spawn(shellPath, shellArgs, {
        cwd,
        timeout: timeout as number | undefined,
        env: envVars,
        // 防止 Windows 上显示控制台窗口
        windowsHide: true,
      });

      const stdoutBuffer = new BoundedTextBuffer();
      const stderrBuffer = new BoundedTextBuffer();
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");

      child.stdout?.on("data", (data: Buffer | string) => {
        stdoutBuffer.append(typeof data === "string" ? data : stdoutDecoder.write(data));
      });

      child.stderr?.on("data", (data: Buffer | string) => {
        stderrBuffer.append(typeof data === "string" ? data : stderrDecoder.write(data));
      });

      // 等待子进程完成
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.on("close", (code: number | null) => resolve(code));
        child.on("error", (err: Error) => {
          // 处理 spawn 错误（如 shell 不存在、cwd 不存在等）
          reject(err);
        });
      });

      checkAbort(ctx.signal);
      stdoutBuffer.append(stdoutDecoder.end());
      stderrBuffer.append(stderrDecoder.end());
      sendProgress(ctx, `命令执行完成`, 1);

      const stdout = stdoutBuffer.result();
      const stderr = stderrBuffer.result();
      const result = {
        success: exitCode === 0,
        exitCode,
        command: params.command.length <= 4096
          ? params.command
          : `${params.command.slice(0, 4096)}...[command truncated, originalLength=${params.command.length}]`,
        commandLength: params.command.length,
        stdout: stdout.text.trim(),
        stdoutLength: stdout.originalLength,
        stdoutHash: stdout.hash,
        stdoutTruncated: stdout.truncated,
        stderr: stderr.text.trim(),
        stderrLength: stderr.originalLength,
        stderrHash: stderr.hash,
        stderrTruncated: stderr.truncated,
        workingDirectory: cwd,
        shell: shellPath,
      };

      logToolEnd(ctx, result);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
        details: result,
      };
    } catch (error: any) {
      logToolError(ctx, error);

      // 处理超时错误
      if (error.code === "ETIMEDOUT" || (error.killed && error.signal === "SIGTERM")) {
        const timeoutResult = {
          success: false,
          error: "命令执行超时",
          command: params.command,
          timeout: params.timeout || 30000,
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(timeoutResult),
            },
          ],
          details: timeoutResult,
        };
      }

      // 处理 spawn 错误（如 shell 不存在、cwd 不存在等）
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorResult = {
        success: false,
        error: errorMessage,
        command: params.command,
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || "",
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(errorResult),
          },
        ],
        details: errorResult,
      };
    }
  },
};

// ============================================================================
// 导出所有 Bash 工具
// ============================================================================

export const bashTools: ToolRegistration[] = [
  ExecuteCommandTool,
];

// ============================================================================
// 测试导出（仅用于单元测试，不对外暴露为公共 API）
// ============================================================================
export const __test__ = {
  isWindowsPlatform,
  findSuitableShell,
  findWindowsShell,
  findExecutableOnPath,
  isExecutable,
  resolveWorkingDirectory,
  buildShellInvocation,
  isPowerShell,
  isCmdShell,
  shellName,
  BoundedTextBuffer,
  summarizeText,
};
