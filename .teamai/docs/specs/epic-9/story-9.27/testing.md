# 测试策略 - Story 9.27

**Story:** 多 Agent 协作运行时架构治理与 HITL 链路修复
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 单元测试

- 测试 HITL 链路修复：waiting → resume → 下游消费真实产出
- 测试 Blackboard 接线：节点执行前后写入 `node:{id}:input` / `node:{id}:output`
- 测试 notify 边事件分发：source 完成时向 target 投递 NOTIFY 事件
- 测试 `buildCollaborationPrompt()` 接线：Worker 初始化时注入 Data.md/Process.md
- 测试 HITL 判定权收敛：Worker 层不决定"是否暂停"，由 DAG 层判定

### 集成测试

- 测试模块围栏：`src/modules/collaboration-runtime/` 不直接 import `@/lib/`
- 测试依赖注入：`parseAgentDefinition / parseToolDefinition` 通过 DI 注入
- 测试 any 清理：`src/lib/collaboration-runtime-bridge/` any 计数为 0

### E2E 测试

- 新增端到端测试：waiting → resume → 下游消费真实产出
- 测试文件：`engine/__tests__/dag-executor.test.ts` HITL describe block，4 个测试用例

---

## 测试用例

### 用例 1：HITL 链路修复

**前置条件**：Worker 进入 waiting 状态

**操作步骤**：
1. Worker 发送 `{type:"waiting"}` 消息
2. 用户 resume
3. 检查下游节点是否消费真实产出

**预期结果**：
- `pendingCommand` 按 waiting 及时 resolve
- resume 后从事件捕获数组提取真实产出
- 下游节点正确消费产出

---

### 用例 2：Blackboard 接线

**前置条件**：节点执行

**操作步骤**：
1. 节点开始执行
2. 检查 Blackboard

**预期结果**：
- 执行前写入 `node:{id}:input`
- 执行后写入 `node:{id}:output`
- resume 时写入 `node:{id}:resume`

---

### 用例 3：notify 边事件分发

**前置条件**：DAG 中有 notify 边

**操作步骤**：
1. source 节点完成
2. 检查 target 节点事件队列

**预期结果**：
- target 收到 NOTIFY 事件
- DAG 不阻塞（notify 边不等待）

---

### 用例 4：模块围栏

**前置条件**：无

**操作步骤**：
1. 执行 `grep -r "from \"@/lib" src/modules/collaboration-runtime/`

**预期结果**：
- 输出为 0

---

### 用例 5：any 清理

**前置条件**：无

**操作步骤**：
1. 执行 `grep -rn ": any\|as any\|<any>" src/lib/collaboration-runtime-bridge/ | grep -v test`

**预期结果**：
- 输出为 0

---

### 用例 6：HITL 判定权收敛

**前置条件**：Worker 执行完成

**操作步骤**：
1. Worker 层不嵌入 `sessionHasToolCalls + endsWithQuestion` 判定
2. DAG 层调用 `decideNodeStatus()` 判定节点状态

**预期结果**：
- Worker 层不决定"是否暂停"
- DAG 层基于完整执行结果判定

---

## 验收标准测试

- [x] `npm run lint` 0 Error（仅针对 `src/modules/collaboration-runtime/**` 与 `src/lib/collaboration-runtime-{service,bridge}/**`）
- [x] `npx tsc --noEmit --skipLibCheck` 在 collaboration-runtime 相关文件 0 error
- [x] HITL E2E 测试通过：`waiting → resume → 下游消费真实产出` 整链路
- [x] `grep -r "from \"@/lib" src/modules/collaboration-runtime/ | wc -l` 输出为 `0`
- [x] `grep -rn ": any\|as any\|<any>" src/lib/collaboration-runtime-bridge/ | grep -v test | wc -l` 输出为 `0`
- [x] 设计文档 §5、§8、§15 与治理结果一致
- [x] 审查报告 13 项 ARCH-RT 全部标记 Resolved 或 Deferred
