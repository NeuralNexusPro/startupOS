# 架构设计 - Story 9.21

**Story:** Agent Pool 预热机制
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- Node.js 子进程管理
- 协作运行时沙箱层

---

## 数据结构

### PoolConfig

```typescript
interface PoolConfig {
  minPoolSize: number;     // 最小空闲实例
  maxPoolSize: number;     // 最大实例数
  ttlMs: number;           // 空闲淘汰 TTL（默认 300000 = 5min）
  healthCheckIntervalMs: number;  // 健康检查间隔（默认 30000 = 30s）
}
```

### PoolMetrics

```typescript
interface PoolMetrics {
  hits: number;            // 命中次数
  misses: number;          // 未命中次数
  avgAcquireMs: number;    // 平均获取延迟
  currentSize: number;     // 当前池大小
  evictions: number;       // 淘汰次数
  healthCheckFailures: number;
}
```

### WarmAgentInstance

```typescript
interface WarmAgentInstance {
  id: string;
  type: string;
  status: 'idle' | 'in-use' | 'evicting';
  createdAt: Date;
  lastUsedAt: Date;
  acquire(): Promise<void>;
  release(): void;
}
```

---

## 模块设计

### AgentPool 核心类

```typescript
class AgentPool {
  constructor(agentFactory: AgentFactory, config: PoolConfig);

  // 获取 Agent 实例（命中则 <100ms，miss 则 ~2s）
  get(agentType: string): Promise<WarmAgentInstance>;

  // 归还实例到池中
  release(instance: WarmAgentInstance): void;

  // 手动预热指定类型的实例
  warmup(agentType: string, count: number): Promise<void>;

  // 淘汰过期实例
  evictExpired(): number;

  // 健康检查
  healthCheck(): Promise<void>;

  // 获取指标
  getMetrics(): PoolMetrics;

  // 关闭池，释放所有实例
  close(): Promise<void>;
}
```

### 预热流程

```
AgentPool.warmup(type, count)
  → for i in count:
    → 创建 sandbox 子进程
    → 发送 initialize（读取 Agent.md/Tool.md/Skill.md）
    → 构建 prompt（不发送 LLM 请求）
    → 标记为 idle，加入池中
```

---

## 代码变更

### 新增文件

```
src/modules/collaboration-runtime/sandbox/agent-pool.ts        # 预热池核心
src/modules/collaboration-runtime/sandbox/pool-metrics.ts      # 指标收集
```

### 设计要点

1. **类型隔离**：按 Agent 类型维护独立子池（Map<string, Pool>）
2. **TTL 淘汰**：定时扫描 `lastUsedAt`，超过 `ttlMs` 则释放
3. **容量控制**：`minPoolSize` 保证最低空闲数，`maxPoolSize` 限制上限
4. **健康检查**：定时 ping 池中实例，异常则淘汰并补充
5. **Metrics 收集**：记录 hits/misses/avgAcquireMs/evictions 等指标
