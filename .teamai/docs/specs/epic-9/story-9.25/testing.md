# 测试策略 - Story 9.25

**Story:** 子进程复用机制（Agent Pool）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 单元测试

- 测试 `AgentSpawner` 类的新增方法：`getOrCreate`、`releaseRef`、`cleanup`、`stopByReuseKey`
- 测试复用逻辑：同一 reuseKey 的多个 session 共享子进程
- 测试引用计数：`refCount` 正确增减
- 测试空闲超时：超过 5 分钟无引用自动释放
- 测试 systemPrompt 热更新：更新后下次 prompt 使用新配置

### 集成测试

- 测试 AgentSpawner 与 AgentManager 的集成
- 测试多 session 并发复用同一子进程

---

## 测试用例

### 用例 1：同一 reuseKey 复用子进程

**前置条件**：无

**操作步骤**：
1. 创建 session1，reuseKey = "skill:ontology-builder"
2. 创建 session2，reuseKey = "skill:ontology-builder"
3. 检查进程列表

**预期结果**：
- 只有 1 个子进程
- 两个 session 共享该进程

---

### 用例 2：不同 reuseKey 创建独立进程

**前置条件**：无

**操作步骤**：
1. 创建 session1，reuseKey = "skill:ontology-builder"
2. 创建 session2，reuseKey = "skill:code-reviewer"
3. 检查进程列表

**预期结果**：
- 有 2 个独立子进程

---

### 用例 3：引用计数正确增减

**前置条件**：session1 和 session2 共享 reuseKey

**操作步骤**：
1. 检查 entry.refCount（应为 2）
2. session1 结束，调用 `releaseRef(reuseKey)`
3. 检查 entry.refCount（应为 1）

**预期结果**：
- 引用计数从 2 减到 1
- 进程不被释放

---

### 用例 4：空闲超时自动清理

**前置条件**：reuseKey 的 refCount = 0，等待 6 分钟

**操作步骤**：
1. 调用 `spawner.cleanup(300000)`

**预期结果**：
- 空闲进程被释放
- `list()` 中不再包含该 reuseKey

---

### 用例 5：systemPrompt 热更新

**前置条件**：session1 已创建，reuseKey = "skill:ontology-builder"

**操作步骤**：
1. session2 创建，reuseKey 相同
2. 调用 `bridge.setSystemPrompt(reuseKey, newPrompt)`
3. session2 发送 prompt

**预期结果**：
- 子进程使用新的 systemPrompt

---

### 用例 6：进程数验证

**前置条件**：创建 3 个 session，reuseKey 分别为 A、A、B

**操作步骤**：
1. 执行 `ps aux | grep agent-worker`

**预期结果**：
- 进程数 = 2（A 和 B 各一个）

---

## 验收标准测试

- [ ] 同一 reuseKey 的多个 session 共享一个子进程
- [ ] `ps aux | grep agent-worker` 验证进程数 = 不同 reuseKey 的数量
- [ ] 引用计数正确增减
- [ ] 空闲超时后自动清理子进程
- [ ] setSystemPrompt 热更新后下次 prompt 使用新配置
- [ ] `npx tsc --noEmit --skipLibCheck` 零 TS 错误
- [ ] 子进程测试覆盖复用逻辑
