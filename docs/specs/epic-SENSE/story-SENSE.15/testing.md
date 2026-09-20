# SENSE.15 测试计划

自动化验证 Goal：**通过 Story SENSE.15 中定义的全部测试 case**。

## 1. 测试矩阵

| ID | 层级 | 场景 | 预期 | AC |
|---|---|---|---|---|
| S15-SEC-01 | Desktop/Web 集成 | 保存并重新读取 API Key | 仅返回 `credentialConfigured`；JSON、localStorage、日志、audit 无明文 | AC1 |
| S15-SEC-02 | 单元 | safeStorage/SecretProvider 不可用 | `SECURE_STORAGE_UNAVAILABLE`，不明文降级 | AC1 |
| S15-SEC-03 | 单元 | baseUrl 为 file、含凭据、私网地址 | 拒绝；生产只允许合法 HTTPS | AC1 |
| S15-RULE-01 | 组件/服务 | 候选含已授权、未授权、已删除资产 | UI/服务端仅接受已存在且授权项 | AC2 |
| S15-RULE-02 | 服务 | 伪造候选 ID、超过 20 项、重复 key | 结构化拒绝且不调用 Jev | AC2 |
| S15-GATE-01 | 单元 | confidence 0.81 / 0.80 / NaN/缺失 | 仅 0.81 可继续自动门禁 | AC3 |
| S15-GATE-02 | 单元 | rule HITL=true 或 needs_hitl=0.5/1.0 | 全部 pending，不 dispatch | AC3 |
| S15-GATE-03 | 单元 | Jev 返回目录外 choice 或概率不完整 | `JEV_INVALID_RESPONSE`，无 lease/dispatch | AC4 |
| S15-FAIL-01 | 集成 | timeout、401、422、429、529、非法 JSON | 安全错误码与人工选择；无默认路由 | AC4 |
| S15-HUMAN-01 | 集成 | 人工选择后授权撤销 | 拒绝并刷新候选，不执行 | AC4 |
| S15-IDEM-01 | 集成 | 同一自动事件重复投递 | 同一 decision/lease/result，不重复 dispatch | AC5 |
| S15-IDEM-02 | 集成 | 人工按钮重复/并发提交不同候选 | 首次结果为事实源，其余返回既有结果 | AC5 |
| S15-AUDIT-01 | 单元/集成 | 自动、人工、忽略、失败 | receipt/audit 可追踪且无 secret/raw payload | AC5 |
| S15-COMPAT-01 | 回归 | 历史 direct 规则与 Connector ACK | 行为不变，ACK 不等待 Jev | AC6 |
| S15-UI-01 | 组件/E2E | 配置规则→低置信→事件页选择 | 无第三页面，键盘可完成，0.8 文案准确 | AC1–AC4 |

## 2. Jev fixture

测试使用本地 fake `JevDecisionPort`/HTTP fixture，不使用真实 API Key。覆盖完整五问回答、概率分布、Noul 无 confidence、慢响应、限流、重载和畸形响应。真实 TypeSafe smoke test 只在获授权的隔离环境人工执行，使用脱敏合成事件并记录模型版本与延迟，不记录 key。

## 3. 自动化命令

```bash
pnpm exec vitest run src/modules/perception-runtime/__tests__ --root packages/core
pnpm exec vitest run src/lib/integrations/jev --root packages/core
pnpm exec vitest run src/components/os/settings src/components/os/sense-center --root packages/web
pnpm --filter @originos/core typecheck
pnpm --filter @originos/web build
pnpm --filter @originos/desktop typecheck
pnpm lint
pnpm lint:boundaries
node scripts/check-architecture-boundaries.cjs --self-test
openspec validate add-jev-perception-decisions --strict
```

具体 package script 名在实施时以仓库实际命令为准，不能以错误命令冒充验证通过。

## 4. 性能与人工验收

- 统计 100 次合成事件的 p95 Jev 决策耗时；总超时不得超过 3 秒，感知决策预算不超过 5 秒。
- 用约 100 条脱敏历史事件标注正确路由、升级与风险，记录误路由率、漏升级率、人工介入率和置信校准；阈值首版仍固定 0.8，调整须另行评审。
- Desktop 实际包验证 safeStorage 保存/重启/清除、Provider 停用、低置信选择和授权撤销。
- 人工检查系统日志、`data/model-providers`、`data/perception/decisions`、audit 与浏览器存储，确认无 API Key 和未脱敏原文。

## 5. 完成记录

当前为设计阶段，尚未执行实现测试。实施完成后必须在此记录命令、通过数、失败项、真实性能数据、人工步骤和剩余风险；不得预先勾选。
