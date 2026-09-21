# Proposal：接入 Jev 受限感知决策

## Why

现有感知规则只能把事件确定性地路由到一个固定目标，无法在多个合法资产间处理模糊意图。需要在不扩大权限、不复制执行链的前提下，引入可解释的概率决策，并把不确定性显式交还用户。

追溯信息：`epic-id: SENSE`，`story-id: SENSE.15`，`task-id: SENSE15-T1`，`owner: OriginOS Runtime Team`，来源：`docs/specs/epic-SENSE/story-SENSE.15/`。

## What Changes

- 在现有模型配置页增加独立 Jev Provider section，配置启停、`baseUrl`、`model` 和 write-only API Key；凭据只由服务端环境或 Desktop `safeStorage` 持有。
- 在感知中心现有触发规则向导增加 Jev 决策模式，只允许选择当下存在且通过 `TargetAuthorization` 的项目、角色和 Skill。
- 在 `perception-runtime` 的授权之后、租约之前加入 Jev 决策编排；固定版本化问题目录并验证完整概率分布。
- 仅当 `route_target.confidence > 0.8` 且规则与 Jev 均无需 HITL 时自动继续；其余情况在现有事件记录中提供人工选择。
- 复用现有 `ExecutionLease`、`TriggerExecutionPort`、幂等、通知和审计；新增脱敏 decision receipt 并关联最终 execution receipt。
- 保持历史 direct 规则兼容；Jev 默认关闭，不迁移或改写旧规则。

非目标：不新增配置页面、数据库、通用执行器、审批系统或认知写入器；不让 Jev 生成内容、目标 ID、工具或参数；不把 Jev 加入 Agent 主 LLM provider 选择。

依赖：SENSE.7 目标授权与路由、SENSE.8 租约/审计、SENSE.9 感知中心、SENSE.12 Desktop Plugin Host，以及 TypeSafe System One HTTP API。

上线：先以默认关闭的 Provider 和规则字段发布，通过合成评估与 Desktop 安全存储验收后逐规则启用。回滚时停用 Provider/决策规则并恢复 direct 路由；保留 receipts、leases 与 audit 供追溯。

## Capabilities

### New Capabilities

- `perception-jev-decisions`: 覆盖 Jev Provider 安全配置、授权候选决策、严格 confidence/HITL 门禁、人工选择、幂等执行和脱敏回执。

### Modified Capabilities

- 无。现有 `perception-live-config` 与 `perception-form-state` 行为保持不变；本变更通过新增 capability 描述决策行为。

## Impact

- Core public types：扩展 `packages/core/src/types/perception.ts` 的规则联合类型、决策端口与回执。
- Core integration/module：新增 `packages/core/src/lib/integrations/jev/` 与 `packages/core/src/modules/perception-runtime/decision/`，修改 router、管理 facade 和测试。
- Desktop：新增 Jev safeStorage/IPC 与 runtime 装配，仍由现有感知 Host 调用既有执行端口。
- Web：修改现有 `SettingsDialog`、`RuleWizard`、`SenseCenter`、Zustand/store service 与薄 API/IPC adapter。
- Persistence：新增非敏感 Provider DataFile、加密凭据记录和 `data/perception/decisions/`；无数据库与旧数据迁移。
- Public API/IPC：新增 Provider summary/write-only credential、resolve/retry decision 契约；所有读取响应禁止返回 API Key 或 secret reference。
- 外部依赖：直接使用原生 `fetch` 调用 TypeSafe API，不新增 npm dependency 或 platform packaging。

Proposal 未通过 `openspec validate add-jev-perception-decisions --strict` 并获得显式批准前，不修改应用源码。
