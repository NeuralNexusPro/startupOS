# 测试策略 - Story 9.23

**Story:** 共识投票机制（BFT/Raft/Quorum）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 单元测试

- 测试 `ConsensusEngine` 类的核心方法：`submitProposal`、`vote`、`checkConsensus`、`getResults`
- 测试三种共识策略的判定逻辑：BFT、Raft、Quorum
- 测试拜占庭检测：标记不一致投票行为
- 测试防重复投票：同一 Agent 同一提案不可重复投票
- 测试超时机制：投票超时后提案自动标记为 timeout

### 集成测试

- 测试共识引擎与事件存储的集成
- 测试多 Agent 并发投票场景

---

## 测试用例

### 用例 1：BFT 模式 n=4 容忍 1 个恶意 Agent

**前置条件**：4 个 Agent，1 个恶意 Agent

**操作步骤**：
1. Agent 1 提交提案
2. Agent 2、3、4 投票（Agent 4 为恶意，投 reject）
3. 调用 `checkConsensus(proposalId)`

**预期结果**：
- 3 票 accept，1 票 reject
- 共识达成（BFT n=4 需 ≥3 票）

---

### 用例 2：Raft 模式 n=3 容忍 1 个故障 Agent

**前置条件**：3 个 Agent，1 个故障 Agent（未投票）

**操作步骤**：
1. Agent 1 提交提案
2. Agent 2、3 投票（Agent 3 故障未投票）
3. 调用 `checkConsensus(proposalId)`

**预期结果**：
- 2 票 accept，0 票 reject，1 票 abstain
- 共识达成（Raft n=3 需 ≥2 票）

---

### 用例 3：Quorum 模式可配置通过比例

**前置条件**：5 个 Agent，`quorumRatio = 0.6`

**操作步骤**：
1. Agent 1 提交提案
2. 3 个 Agent 投 accept，2 个投 reject
3. 调用 `checkConsensus(proposalId)`

**预期结果**：
- 3/5 = 0.6 ≥ quorumRatio
- 共识达成

---

### 用例 4：拜占庭检测标记异常投票

**前置条件**：Agent 1 对提案 A 投 accept，对提案 B 投 reject（内容相同）

**操作步骤**：
1. Agent 1 对提案 A 投票
2. Agent 1 对提案 B 投票（内容与 A 相同）
3. 调用 `getByzantineReport()`

**预期结果**：
- 报告标记 Agent 1 为"不一致投票"

---

### 用例 5：防重复投票

**前置条件**：Agent 1 已对提案投 accept

**操作步骤**：
1. Agent 1 再次投票（改为 reject）

**预期结果**：
- 投票被拒绝（返回错误"Duplicate vote"）

---

### 用例 6：超时机制

**前置条件**：`timeoutMs = 1000`

**操作步骤**：
1. Agent 1 提交提案
2. 等待 2 秒
3. 检查提案状态

**预期结果**：
- 提案状态为 `timeout`

---

## 验收标准测试

- [ ] BFT 模式 n=4 可容忍 1 个恶意 Agent（3 票接受即通过）
- [ ] Raft 模式 n=3 可容忍 1 个故障 Agent（2 票接受即通过）
- [ ] Quorum 模式可配置通过比例（0.5/0.66/0.75）
- [ ] 拜占庭检测标记异常投票行为（同一 Agent 对相同内容矛盾投票）
- [ ] 同一 Agent 对同一提案不可重复投票
- [ ] 共识结果持久化到 EventStore
- [ ] 超时后提案自动标记为 timeout
