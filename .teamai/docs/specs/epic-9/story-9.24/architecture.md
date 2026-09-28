# 架构设计 - Story 9.24

**Story:** PID 孤儿会话回收
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- Node.js 进程管理
- 文件系统存储（JSON）

---

## 数据结构

### CollaborationSession 扩展

```typescript
interface CollaborationSession {
  // ... 现有字段 ...
  hostPid?: number;           // 创建会话的进程 PID
  terminationReason?: string; // 孤儿回收原因
}
```

### OrphanReport 报告

```typescript
interface OrphanReport {
  sessionId: string;
  hostPid: number;
  status: 'orphan' | 'alive' | 'unknown';
  reason: string;             // "ESRCH: process dead" / "EPERM: other user" / "TTL expired"
  action: 'terminated' | 'kept' | 'pending';
}
```

### 回收策略

| 策略 | 条件 | 动作 |
|------|------|------|
| PID-based | `process.kill(pid, 0)` → ESRCH | 标记 `terminated`，记录原因 |
| PID-based | `process.kill(pid, 0)` → EPERM | 跳过（其他用户进程） |
| TTL fallback | 无 PID，`updatedAt` > 24h | 标记 `terminated`，记录 "TTL expired" |

---

## 模块设计

### OrphanReconciler 核心类

```typescript
class OrphanReconciler {
  constructor(store: CollaborationStore);

  // 创建会话时记录 PID
  recordPid(sessionId: string): void;

  // 检测孤儿会话
  detectOrphans(): Promise<OrphanReport[]>;

  // 清理孤儿会话
  reconcile(reports: OrphanReport[]): Promise<void>;

  // TTL 兜底检查
  checkTTLExpired(maxAgeMs: number): Promise<OrphanReport[]>;

  // 完整回收流程
  runReconciliation(): Promise<OrphanReport[]>;
}
```

### PID 检测逻辑

```typescript
function checkProcessAlive(pid: number): 'alive' | 'dead' | 'unknown' {
  try {
    process.kill(pid, 0);    // 信号 0 = 仅检测，不发送信号
    return 'alive';
  } catch (err) {
    if (err.code === 'ESRCH') return 'dead';    // 进程不存在
    if (err.code === 'EPERM') return 'alive';   // 进程存在但无权发信号
    return 'unknown';
  }
}
```

---

## 代码变更

### 新增文件

```
src/modules/collaboration-runtime/session/orphan-reconciler.ts   # 孤儿检测与回收
```

### 设计要点

1. **PID 记录**：创建会话时记录 `hostPid`
2. **孤儿检测**：使用 `process.kill(pid, 0)` 检测进程存活
3. **安全边界**：ESRCH → 进程已死，EPERM → 存活但属其他用户
4. **TTL 兜底**：无 PID 的旧条目超过 24h 自动回收
5. **持久化**：检测结果写回状态文件
