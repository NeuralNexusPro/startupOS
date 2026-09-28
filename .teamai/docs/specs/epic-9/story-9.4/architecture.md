# 架构设计 - Story 9.4

**Story:** 依赖注入配置（CollaborationRuntimeDeps）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式（禁止 `any` 类型）
- 依赖注入模式（构造函数注入）
- 模块隔离（禁止 import `src/lib/` 或 `src/components/`）

## 数据结构

### CollaborationRuntimeDeps 接口

```typescript
interface CollaborationRuntimeDeps {
  // LLM 与 Agent 引擎
  agentEngine: {
    startAgent(config: AgentConfig): Promise<AgentInstance>;
    stopAgent(id: string): Promise<void>;
    getAgent(id: string): AgentInstance | null;
  };

  // 工具执行
  toolExecutor: {
    execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
    listTools(): ToolRegistration[];
  };

  // 本体数据存储
  ontologyStore: {
    query(entityType: string, filter: Record<string, unknown>): Promise<unknown[]>;
    save(entityType: string, data: unknown): Promise<void>;
    delete(entityType: string, id: string): Promise<void>;
  };

  // 文件读写
  fileOps: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    listDir(path: string): Promise<string[]>;
  };

  // 事件发射（SSE 推送）
  eventEmitter: {
    emit(event: RuntimeEvent): void;
  };
}
```

## 模块设计

**文件：** `src/modules/collaboration-runtime/config.ts`

### 模块初始化

```typescript
class CollaborationRuntime {
  constructor(private deps: CollaborationRuntimeDeps) {}
}
```

**注入时机：** API route 负责组装 `CollaborationRuntimeDeps` 并注入。

## 代码变更

- 新增 `config.ts`：定义 `CollaborationRuntimeDeps` 接口和 `CollaborationRuntime` 类
- 模块内部所有依赖通过构造函数注入，禁止直接 import 外部模块
