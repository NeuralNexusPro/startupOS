# Epic C: 认知系统 (Cognitive System)

**状态:** 📋 Planning
**优先级:** High
**创建日期:** 2026-04-28

---

## 📋 概述

为 OriginOS 构建认知系统，使 Agent 能够在持续服务用户的过程中**积累知识**、**沉淀经验**、**持续进化**。

认知系统由三部分组成：

| 组件 | 职责 | 类比 |
|------|------|------|
| **知识库 (Knowledge Base)** | 理解世界 — 领域知识、事实、概念的结构化存储 | "我懂什么" |
| **实践日志 (Practice Log)** | 记录行为 — Agent 每次决策、工具选择、执行结果的结构化日志 | "我做了什么" |
| **经验模式库 (Pattern Library)** | 优化行为 — 从实践中提炼的最佳路径、反模式、效率指标 | "我该怎么做得更好" |

## 🔄 核心数据流

### 每轮发生（轻量）

```
用户输入/上传文件
    ↓
Agent 处理（思考 → 选工具 → 执行 → 输出）
    ↓
实践日志记录（自动）
├─ 决策过程（Agent 的 reasoning）
├─ 工具选择（选了什么，为什么）
├─ 执行结果（成功/失败/效果指标）
└─ 用户反馈（纠正次数、满意度）
```

### 周期性执行（重量，session_end 或每 N 轮触发）

```
分析实践日志（批量分析）
├─ 认知事物 → 知识库交互
│   ├─ 从最近 N 轮实践中提取新知识
│   ├─ 结合已有本体，创建/更新实体、概念、关系
│   └─ 业务模型（business-model.json）作为知识源载入
│
└─ 解决问题 → 经验模式库交互
    ├─ 分析最近实践路径，提取高效工具链
    ├─ 对比已有模式，更新效果指标
    └─ 新路径沉淀为经验模式（或标记为反模式）
```

## 🏗️ 架构设计

### 整体架构 — 借鉴 hermes-agent MemoryManager 模式

```
CognitiveManager（认知管理器，类似 MemoryManager）
├── KnowledgeProvider（知识库 Provider）
│   ├── load_snapshot()     → 启动时加载知识快照到 prompt
│   ├── run_periodic(logs)  → 周期性分析实践日志，提取知识
│   └── system_prompt_block() → 静态指令注入
│
├── PatternProvider（经验模式 Provider）
│   ├── load_snapshot()     → 启动时加载模式快照到 prompt
│   ├── run_periodic(logs)  → 周期性分析实践日志，沉淀模式
│   └── system_prompt_block() → 模式使用指南
│
└── 生命周期钩子（在 pi-agent turn 中自动触发）
    ├── on_turn_end(turn_data)     → 每轮：记录实践日志（轻量）
    ├── on_session_end(messages)   → 周期：触发知识提取 + 模式沉淀
    └── on_delegation(task, result) → 子任务完成后知识合并
```

**每轮 vs 周期性职责划分：**

| 触发时机 | 操作 | 重量级 |
|----------|------|--------|
| `on_turn_end` | 记录实践日志到 JSONL | 轻量（只写磁盘） |
| `on_session_end` | 批量分析日志 → 提取知识 + 沉淀模式 | 重量（LLM 分析） |
| 每 N 轮（可选） | 增量分析最近未处理的日志 | 重量（LLM 分析） |
| Agent 启动 | 加载知识库 + 模式快照到 prompt | 轻量（读文件） |

**Frozen Snapshot（冻结快照）模式：**
- Agent 启动时加载知识库快照 → system prompt（Layer 2: StateMemory）
- 中途生成的知识只写入磁盘，不修改内存中的快照
- 保持 LLM prefix cache 稳定，避免每轮重建 prompt

### 认知所有权分域（Story M.12）

- 用户 Profile 位于 `data/users/{userId}/cognition/`，由所有 Agent 只读共享快照。
- Agent/RoleAgent 世界模型位于各自 `data/agents/{id}/cognition/`；Project 位于 `data/projects/{id}/cognition/`。
- 独立 Skill 不拥有持久 Knowledge、Pattern 或 cognition bank；继承型 Skill 仅可写入显式调用方 owner。
- 旧 `Memory.md` human block 与 `Taste.md` 首次启动时迁移为低置信候选，保留原文件并写入幂等 marker。

### 知识库 — LLM Wiki 模式 + Ontology 承载

参考 [LLM Wiki](../../llm-wiki.md) 模式，知识库采用三层结构：

```
{agentOrProject}/
├── knowledge/              # 知识库根目录
│   ├── schema.md           # 知识结构约定（如何组织、命名、关联）
│   ├── index.md            # 知识索引（内容目录 + 摘要）
│   ├── log.md              # 知识变更日志（时间线）
│   ├── sources/            # 原始来源（不可变，Agent 只读）
│   │   ├── uploaded/       # 用户上传的文件副本
│   │   └── external/       # 外部信息摘要
│   ├── ontology/           # 本体知识（由 OriginOS ontology 系统承载）
│   │   ├── domains/        # 领域层
│   │   ├── concepts/       # 概念层
│   │   └── relations/      # 关系层
│   └── wiki/               # 非结构化知识（LLM 维护的 wiki pages）
│       ├── entities/       # 实体页面
│       ├── concepts/       # 概念页面
│       └── synthesis/      # 综合分析页面
```

- **结构化知识**通过 Ontology 系统存储（实体-关系-属性）
- **非结构化知识**通过 wiki markdown 文件存储（LLM 自动编写、更新、交叉引用）
- Agent 通过本体 API 创建/更新知识，通过文件工具维护 wiki
- 参考 hermes-agent 的 `MemoryStore`：文件锁 + 原子写入 + 字符预算

### 实践日志 — 结构化 Turn 记录

```
{agentOrProject}/
├── practice/
│   ├── turns/              # 按 turn 编号组织
│   │   ├── turn-{N}.json   # 单次 turn 的完整记录
│   │   └── ...
│   └── summary.json        # 聚合统计（总 turn 数、成功率、常用工具等）
```

**turn-{N}.json 结构：**

```json
{
  "turnId": "turn-42",
  "timestamp": "2026-04-28T10:30:00Z",
  "sessionId": "persistent-proj-xxx",
  "userInput": "用户的原始消息",
  "uploadedFiles": ["filename.pdf", "data.csv"],
  "thinking": "Agent 的思考过程（reasoning）",
  "toolCalls": [
    {
      "tool": "read_file",
      "params": {"filePath": "..." },
      "result": "success|error",
      "output": "...",
      "reason": "为什么选择这个工具"
    }
  ],
  "outcome": {
    "resolved": true,
    "toolChainLength": 3,
    "userCorrections": 0,
    "userSatisfaction": "positive|neutral|negative"
  },
  "knowledgeGenerated": ["wiki/entity-X.md", "ontology/concept-Y"],
  "patternApplied": "pattern-Z"
}
```

### 经验模式库 — 自动提取 + 效果评估

```
{agentOrProject}/
├── patterns/
│   ├── registry.json       # 模式注册表（名称、描述、指标）
│   ├── pattern-{id}.md     # 模式详情（触发条件、工具链、关键决策、结果）
│   └── analysis/
│       └── report-{date}.md # 定期分析报告
```

**模式结构：**

```markdown
# Pattern: {名称}

## 触发条件
当遇到 {X 类型问题} 或 {Y 场景}

## 最佳路径
1. 使用工具 A 读取/分析输入
2. 使用工具 B 执行核心操作
3. 使用工具 C 验证/输出

## 关键决策点
- 如果 {条件1}，则选择 {方案A}
- 如果 {条件2}，则选择 {方案B}

## 效果指标
- 平均工具调用次数：{N}
- 用户纠正率：{X}%
- 任务完成率：{Y}%

## 适用场景
- ...

## 反模式（已淘汰的失败路径）
- ...
```

**模式有效性评估：**
- 工具调用链越短 → 效率越高
- 用户纠正次数越多 → 效果越差
- 任务完成率 → 模式是否可靠
- 自动分析实践日志，提取高效路径为模式，标记低效路径为反模式

## 🔑 Stories

| Story | 标题 | 优先级 |
|-------|------|--------|
| C.1 | 认知管理器基础设施（CognitiveManager + Provider 接口） | Critical |
| C.2 | 知识库基础设施（目录结构 + schema + index/log） | Critical |
| C.3 | 知识来源 Ingest（文件上传、外部信息 → 知识库） | High |
| C.4 | 实践日志记录系统（pi-agent turn hook → 结构化日志） | Critical |
| C.5 | 经验模式提取引擎（日志分析 → 模式生成 + 效果评估） | High |
| C.6 | 知识库本体集成（wiki → ontology 双向同步） | High |
| C.7 | 角色知识体系插拔（RoleAgent 知识挂载点） | Medium |
| C.8 | Reflexion 失败反思（情景记忆 + 叙事性反思） | High |
| C.9 | Letta 三元记忆架构（Memory Block + Sleep-time Compute + 分层注入） | High |
| C.10 | Pattern 机制重构 — 基于 Memory Core 的上层应用（Positive/Negative + 用户纠正信号） | High |

---

## 🔗 相关文档

- [LLM Wiki 模式](../../llm-wiki.md) — 知识库设计的参考来源
- [hermes-agent MemoryManager](../../../hermes-agent/agent/memory_manager.py) — 生命周期钩子设计参考
- [hermes-agent MemoryProvider](../../../hermes-agent/agent/memory_provider.py) — Provider 接口设计参考
- [AGENTS.md 架构规约](../../../AGENTS.md) — 本体构建系统约束
- [Epic R 完成记录](../epic-R/) — RoleAgent 循环重构
