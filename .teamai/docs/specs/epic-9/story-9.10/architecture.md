# 架构设计 - Story 9.10

**Story:** Node.js 沙箱（MVP）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- `@anthropic-ai/sandbox-runtime` 沙箱包装
- Node.js 子进程管理
- AbortSignal 超时控制

## 数据结构

### SandboxExecutor 接口

```typescript
interface SandboxExecutor {
  initialize(): Promise<void>;

  spawn(config: {
    command: string;
    allowRead: string[];
    allowWrite: string[];
    denyWrite: string[];
    timeoutMs: number;
  }): Promise<SandboxHandle>;
}

interface SandboxHandle {
  pid: number;
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  kill(): Promise<void>;
  getViolations(): SandboxViolation[];
}
```

### 沙箱配置示例

```typescript
const config = {
  command: `node dist/agent-worker.js ${agentId}`,
  allowRead: [`data/projects/${projectId}/**`],
  allowWrite: [`data/projects/${projectId}/**`],
  denyWrite: ['~/.claude/**', '~/.ssh/**', '~/.gitconfig'],
  timeoutMs: 300_000,
};
```

## 模块设计

**文件：** `src/modules/collaboration-runtime/sandbox/node-executor.ts`

## 代码变更

- 新增 `sandbox/node-executor.ts`：实现沙箱执行器
- 使用 `@anthropic-ai/sandbox-runtime` 包装子进程
- 实现文件系统权限控制（allow-read/allow-write/deny-write）
- 实现超时控制（AbortSignal）
- 记录违规事件到 SandboxViolationStore
