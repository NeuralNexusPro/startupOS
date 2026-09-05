# 架构设计文档 - Story M.12

**Story:** Hindsight-inspired 全局用户认知与 Agent 世界模型分域  
**版本:** 1.0  
**最后更新:** 2026-08-28

## 设计结论

借鉴 Hindsight 的“bank + facts/experiences/observations/mental models + retain/recall/reflect”，但不引入 PostgreSQL、服务端框架或其 Python 实现。OriginOS 使用本地 DataFile/JSONL，并在 `memory-core` 内实现 bank 抽象。Bank 表示所有权隔离，不等同于运行目录。

## Scope 与存储

| Scope | 所有者 | 内容 | 路径 |
|---|---|---|---|
| user | 用户 | Profile、偏好、个人风格、长期边界 | `data/users/{userId}/cognition/` |
| agent | Agent/RoleAgent | world facts、experiences、observations、mental models | `data/agents/{agentId}/cognition/` |
| project | 项目 | 项目事实、决策、项目模型 | `data/projects/{projectId}/cognition/` |
| session | 会话 | 原始 turn 与临时上下文 | scope owner 下 `memory/history/{sessionId}.jsonl` |

Skill 没有用户认知所有权；首页 Skill 的 `data/skills/{skillName}` 只保存业务产物和 session recall。

## 场景化 Observation Policy

Observation 采用统一引擎和策略注入，不创建 RoleAgentObserver、ProjectObserver、SkillObserver 三套重复实现。

| Mode | 观察目标 | Knowledge 输出 | Pattern 输出 | 冲突方式 |
|---|---|---|---|---|
| `role-agent` | 领域事实、专业判断、能力边界、跨任务经验 | Agent 世界认知 | `role-wide` 专业路径 | conflicting evidence |
| `project` | 需求、约束、决策、项目实体、风险、状态 | Project ontology/wiki | `project-local` 实施路径 | supersede + validity |
| `standalone-skill` | 当前执行输入、过程、输出 | 不持久化 | 不持久化 | session only |
| `inherited-skill` | Skill 产生的事实与执行证据 | 提交给调用方 | 提交给调用方 | 继承调用方 |

```typescript
type ObservationMode =
  | 'role-agent'
  | 'project'
  | 'standalone-skill'
  | 'inherited-skill';

interface ObservationContext {
  mode: ObservationMode;
  owner:
    | { scope: 'agent'; ownerId: string }
    | { scope: 'project'; ownerId: string }
    | { scope: 'session'; ownerId: string };
  provenance: {
    sessionId: string;
    agentId?: string;
    projectId?: string;
    skillId?: string;
  };
  policy: ObservationPolicy;
}

interface ObservationPolicy {
  allowedKnowledgeKinds: CognitionKind[];
  allowPatternPromotion: boolean;
  minimumIndependentEvidence: number;
  trustedSources: EvidenceRef['source'][];
  temporalMode: 'stable' | 'project-state' | 'ephemeral';
  conflictMode: 'conflict' | 'supersede' | 'discard';
  patternApplicability: 'role-wide' | 'project-local' | 'none';
  promptTemplateId: string;
}
```

RoleAgent 的用户明确确认或可信文档可用单证据晋升；模型推断至少需要两个独立证据。Project 的明确决策可以立即 active，但必须记录决策状态、有效期和 supersedes。Standalone Skill 永远使用 ephemeral policy。

## Knowledge / Pattern 适配

```text
Observation Engine
  ├─ world_fact / observation ──> KnowledgeProvider
  │                                ontology + wiki + Knowledge.md
  └─ experience / correction ───> PatternProvider
                                   archival + Patterns.md
```

现有 Pattern 的 correction detector、positive/negative 分类、Archival 检索和 renderer 保留。适配层为 Pattern evidence 增加 `ownerScope`、`ownerId`、`sourceSkillId`、`evidenceRefs`、`proofCount` 和 `applicability`，并以稳定 key 保证幂等。旧 `cognitive/pattern-provider.ts` 与 `enhanced-pattern-provider.ts` 在引用审计完成后退出主路径。

## 数据模型

```typescript
type CognitionScope = 'user' | 'agent' | 'project';
type CognitionKind = 'world_fact' | 'experience' | 'observation' | 'mental_model';

interface CognitionRecord {
  id: string;
  scope: CognitionScope;
  ownerId: string;
  kind: CognitionKind;
  content: string;
  confidence: number;
  status: 'candidate' | 'active' | 'conflicted' | 'retracted';
  evidence: EvidenceRef[];
  proofCount: number;
  validFrom?: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
}
```

Mental model 是对稳定问题的物化答案，例如 user bank 的“这个用户如何沟通和决策？”、agent bank 的“我目前如何理解这个领域？”。启动只读物化文件，不运行 LLM。

## 运行管线

```text
turn_end -> session recall
         -> retain classifier
         -> resolve observation context + policy
             user signal  -> user bank candidates
             world fact   -> agent/project bank facts
             tool outcome -> agent/project bank experiences

session_end / every N turns -> reflect
  -> evidence fold / deduplicate / conflict handling
  -> scene policy promotion + Knowledge/Pattern routing
  -> observations
  -> refresh mental models
  -> publish immutable prompt snapshot
```

## Prompt 组合

```text
GlobalUserProfile(read-only)
  -> AgentIdentity(Agent.md / Role.md)
  -> AgentWorldModel(read-only snapshot)
  -> ProjectContext
  -> SessionRecall(on-demand)
```

`persona` 不再代表用户风格；Agent identity 由 Agent.md/Role.md/Taste.md 管理。`human` block 仅作为 legacy reader，不能成为 Agent 目录的新写入口。

## 模块与依赖

```text
packages/web app / packages/desktop main
  -> pi-agent launchers (integration boundary)
  -> packages/core/src/modules/memory-core/session
  -> packages/core/src/modules/memory-core/{bank,core,recall,archival}
  -> packages/core/src/lib/{storage,shared,types}
```

新增 `memory-core/bank/` 只依赖 Node 文件 API和 core shared/types；不得导入 web、desktop 或 pi-agent feature 内部实现。Launcher 只负责构造 `ObservationContext` 并传入 `userId/agentId/projectId/dataRoot`，不得自行整理认知。策略解析器位于 core 公共模块；Provider 仅消费已经解析的 ownership/policy。

## 安全与性能

- 所有路径由受控 ID 和 dataRoot 解析，拒绝 `..`、绝对路径和跨 scope 读取。
- retain 前做 secrets/PII 防御；证据可保存摘要和引用，默认不复制完整工具输出。
- recall 并行执行已有 semantic/keyword/temporal 信号，后续增加 graph；使用 RRF 融合。
- observation 与 mental model 后台刷新，消息主路径只追加 recall。

## AGENTS.md 符合性

- 业务主实现位于 `packages/core/src/modules/memory-core`，不进入 Next app route。
- 只使用本地文件系统，无数据库或后端框架。
- core 不依赖 web/desktop；跨 feature 通过 index.ts 公共 API。
- 每个新增模块包含独立 types.ts；严格 TypeScript，不新增 `any`。
