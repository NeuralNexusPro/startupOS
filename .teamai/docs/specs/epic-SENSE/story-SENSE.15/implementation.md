# SENSE.15 实施拆分

SENSE15-T1 是一个纵向可验收 Task，对应 OpenSpec `add-jev-perception-decisions`。以下是 Proposal 内部工作包，不再递归创建 Proposal；获批后应用源码必须由隔离的 subagent Task worktree 实施。

| 工作包 | 依赖/并行 | 写入范围 | 角色 | 必需证据 |
|---|---|---|---|---|
| S15-W1 契约与 Jev adapter | 首先串行 | `packages/core/src/types/perception.ts`、`packages/core/src/lib/integrations/jev/**` | Core/Integration | 请求/响应、超时、401/422/429/529、恶意响应单测 |
| S15-W2 Provider 安全配置 | 依赖 W1；可与 W3 并行 | core provider config、desktop safeStorage/IPC、web settings service/UI | Desktop/Security | key 不回读、不落 JSON/localStorage/log；重启恢复；无安全存储失败测试 |
| S15-W3 决策编排与存储 | 依赖 W1；可与 W2 并行 | `packages/core/src/modules/perception-runtime/decision/**`、router/types 测试 | Runtime | 授权过滤、0.8 边界、HITL、receipt、lease 幂等、direct 回归 |
| S15-W4 运行时装配与人工解决 | 依赖 W2/W3，串行 | desktop plugin host/service/IPC、core perception facade | Runtime/Desktop | 自动与人工路径使用同一授权/lease/dispatch；并发重复选择测试 |
| S15-W5 规则与事件交互 | 依赖 W1 契约；与 W4 可并行，集成前对齐 IPC | web `RuleWizard`、`SenseCenter`、store/services/tests | Web/UX | 候选只读授权列表、低置信/失败/失效/已解决组件测试、可访问性 |
| S15-W6 联合验收与文档 | 依赖 W2–W5，串行 | Story、OpenSpec、AGENTS、changes、测试记录 | QA/Tech Lead | 全部 AC、构建、lint、边界、自测、strict validate 与回滚演练 |

## 文件级审查重点

- 不向 `LLMProviderType` 加入 Jev；Jev 是独立决策 Provider，不参与 Agent 模型选择。
- 不复用当前会把 LLM key 写入 `localStorage`/`user-config.json` 的路径保存 Jev key。
- `PerceptionRouter` 只插入一个可选 orchestrator；direct 分支保持短路兼容。
- 候选保存、Jev 调用前、人工提交前均在服务端校验；UI 过滤不是安全边界。
- `notify_user` 复用现有通知；`dispatch` 复用 `TriggerExecutionPort`；不新建执行器。
- `retain_as_evidence` 不直接写 Memory/Core cognition。

## 迁移与回滚

历史规则缺少 `routingMode` 时按 direct 读取，不改写原文件。新字段均为向后兼容；旧版本回滚时应忽略未知 decision 文件。上线先默认关闭 Jev Provider，再启用测试规则，最后按规则逐项开放。回滚只需停用 Provider/规则；保留 receipts、audit、leases，不删除证据。

## 实施门禁

1. Proposal 通过 `openspec validate add-jev-perception-decisions --strict` 并获得显式批准。
2. 从最新 `dev` 创建 `proposal/add-jev-perception-decisions` 主 worktree。
3. 至少创建一个 `proposal-task/...` 分支/worktree；W2/W3 在写入范围确认无冲突后并行。
4. 只有具备测试与证据的 checklist 才能勾选完成。
