# 架构设计 - Story 9.23

**Story:** 共识投票机制（BFT/Raft/Quorum）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- 分布式共识算法（BFT/Raft/Quorum）
- 事件存储（EventStore）

---

## 数据结构

### 共识策略类型

```typescript
type ConsensusStrategy = 'byzantine' | 'raft' | 'quorum';
```

### Proposal 提案

```typescript
interface Proposal {
  id: string;
  proposerId: string;
  description: string;
  payload: unknown;
  createdAt: Date;
  status: 'pending' | 'voting' | 'accepted' | 'rejected' | 'timeout';
}
```

### Vote 投票

```typescript
interface Vote {
  proposalId: string;
  voterId: string;
  vote: 'accept' | 'reject' | 'abstain';
  reasoning?: string;
  timestamp: Date;
}
```

### ConsensusConfig 配置

```typescript
interface ConsensusConfig {
  strategy: ConsensusStrategy;
  minAgents: number;        // 最少参与 Agent 数
  quorumRatio?: number;     // Quorum 模式下的通过比例（默认 0.5）
  timeoutMs: number;        // 投票超时（默认 60000）
}
```

### 共识判定规则

| 策略 | 通过条件 | 容错 |
|------|---------|------|
| Byzantine (n=4) | ≥ 3 票接受 | 容忍 1 个恶意 Agent |
| Byzantine (n=7) | ≥ 5 票接受 | 容忍 2 个恶意 Agent |
| Raft (n=3) | ≥ 2 票接受 | 容忍 1 个故障 Agent |
| Raft (n=5) | ≥ 3 票接受 | 容忍 2 个故障 Agent |
| Quorum (自定义) | ≥ quorumRatio × n | 按配置 |

---

## 模块设计

### ConsensusEngine 核心类

```typescript
class ConsensusEngine {
  constructor(config: ConsensusConfig, participants: string[]);

  // 提交提案
  submitProposal(proposerId: string, description: string, payload: unknown): Proposal;

  // 投票
  vote(proposalId: string, voterId: string, vote: Vote['vote'], reasoning?: string): void;

  // 检查是否达成共识
  checkConsensus(proposalId: string): boolean;

  // 获取投票结果
  getResults(proposalId: string): {
    accepted: number;
    rejected: number;
    abstained: number;
    consensus: boolean;
  };

  // 获取拜占庭检测报告
  getByzantineReport(): ByzantineReport;
}
```

---

## 代码变更

### 新增文件

```
src/modules/collaboration-runtime/protocol/consensus.ts        # 共识协议核心
src/modules/collaboration-runtime/protocol/byzantine-detector.ts # 拜占庭检测
```

### 设计要点

1. **三种共识策略**：BFT（拜占庭容错）、Raft（故障容错）、Quorum（可配置）
2. **提案/投票协议**：Agent 提交提案 → 其他 Agent 投票 → 多数/法定通过
3. **拜占庭检测**：跨提案检测不一致投票，标记潜在恶意 Agent
4. **防重复投票**：同一 Agent 同一提案不可重复投票
5. **超时机制**：投票超时后提案自动标记为 timeout
6. **持久化**：共识结果写入 EventStore，可搜索历史
