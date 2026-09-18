# Design

## Context

ONT.1 已提供 `CanonicalAgentContract`、`CanonicalSkillContract` 与 facts/action 引用；ONT.4 已提供 canonical ontology 静态校验。本 Task 只组合这些类型形成发布前纯校验 API，不接入 P2 页面或持久化。

## Goals / Non-Goals

**Goals:**

- 统一校验单个 Agent/Skill contract 的引用、重复声明和 Action 权限。
- 用最小 node/edge/external-input DTO 校验 SOP required facts 是否连通。
- 返回可定位、顺序稳定的 `CanonicalValidationResult`。

**Non-Goals:**

- 不判断 DAG 环、执行顺序、并发、重试、预算或 Agent 能力选择。
- 不自动修复/补边，不编译或保存 P2 execution contract。
- 不查询 runtime facts，不执行 Action/Rule。

## Decisions

### 1. 复用已有 contract DTO，仅新增 flow 包装类型

新增 `CanonicalContractNode`、`CanonicalContractEdge`、`CanonicalContractFlow`。Node 使用显式 `kind` 与已有 contract 联合，edge 只携带稳定 FactType 引用；externalInputs 表示由 SOP 边界提供的事实类型。

备选方案是修改 Agent/Skill contract 加 nodeId 和依赖；未采用，因为同一契约可在多个方案节点复用，拓扑属于 flow 而非能力契约。

### 2. 两级纯函数校验

`validateCanonicalContract` 先调用 ONT.4 ontology validator，再校验 identity/version、input/output FactType、Action binding 与权限。`validateCanonicalContractFlow` 建立一次节点和引用索引，复用内部 contract 校验，然后按声明顺序校验 edge 和 required inputs。

备选方案是让 P2 遍历并逐项调用；未采用，因为会复制错误码、路径和连通性规则。

### 3. 连通性按完整 FactType 引用精确匹配

匹配键由 ontologyId/version/conceptId/factTypeId 构成，不按名称、别名或结构相似度猜测兼容。每条 edge 必须同时被上游 output 和下游 input 声明；required input 可由入边或 externalInputs 满足。

本轮不做可转换类型推断。需要转换时，P2 应显式建模转换 Skill/Agent 节点。

### 4. 不检查 DAG 环

ONT6-T1 只回答语义契约是否连接。环、拓扑排序和运行调度由 P2/Epic 9 所有；在 ontology feature 重复实现会违反职责边界。

## Risks / Trade-offs

- [精确匹配可能拒绝语义相近类型] → 要求显式转换节点，避免运行时猜测。
- [Flow 只证明静态来源，不证明运行时一定产出] → required output 的运行验证由后续 execution contract/verifier 负责。
- [大图重复扫描] → 使用 Map/Set 保持线性级别；不新增缓存或索引。

## Migration Plan

仅新增 DTO 与公共纯函数，无既有调用方迁移。回滚删除新增文件、类型和导出即可。

## Subagent 实施边界

单一 Core subagent 在独立 Task worktree 修改 ontology types、新 validator 文件、公共导出与定向测试。Proposal 集成者只维护 Story/OpenSpec/AGENTS/changelog、合并与回归。
