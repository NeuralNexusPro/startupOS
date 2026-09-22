# ONT.8 测试

**Story:** Cross-package Adapters 与端到端验证  
**版本:** 0.1.0  
**最后更新:** 2026-09-19

## 测试目标

证明 Web 与 Desktop 通过同一公共业务边界完成项目语义执行，并在版本冲突、并发、中断、旧项目和多平台条件下保持唯一事实源、幂等回执与可恢复性。

## 测试层级

| 层级 | 范围 | 禁止替代 |
|---|---|---|
| Unit/type | DTO、scope/error parser、gate、对账状态机 | 不能替代文件提交测试 |
| Core integration | 真实临时 data root、ONT/P2/Task/Run public ports | 不能直接写 JSONL/private entries |
| Web/Desktop contract | 同一 fixture 的 HTTP/IPC 映射与安全边界 | 不能复制业务期望到两套 fixture |
| E2E/fault injection | 访谈→发布→执行→看板→恢复 | 不能用 mock success 代替 receipt/replay |
| Package smoke | development、Windows x64、macOS x64/arm64 | 开发态通过不能代替打包平台通过 |

## E01–E16 联合矩阵

| ID | Given / When | Then | 主要覆盖 AC |
|---|---|---|---|
| E01 | 已确认客户/需求概念，发布方案并创建任务 | 每个 WorkItem 可追溯 conceptId、ontologyVersion、contractHash 与访谈来源 | AC1、AC2 |
| E02 | 概念未确认、关系歧义或状态缺失，尝试发布 | 返回可定位 DesignGap，不产生可启动契约 | AC1、AC7 |
| E03 | 输入事实缺失或状态未确认，上游报告 completed | 下游阻塞，不调用 Worker、不写事实 | AC2、AC3 |
| E04 | 同一 Agent 接手两个客户任务 | context/run/workItem/attempt/事实隔离，Blackboard 不串任务 | AC2 |
| E05 | 旧任务执行中发布设计新版本 | 旧 run 保持原契约，无 latest 隐式切换 | AC2 |
| E06 | Worker 读集过期或两个 Worker 并发提交 | 一个合法接纳，另一个明确冲突/待核对，不丢更新 | AC2、AC4、AC6 |
| E07 | Worker 自报成功但 verifier 失败或无权限 | 不接纳业务完成，不登记 passed Evidence | AC3、AC7 |
| E08 | 在 intent、Action、接纳、Evidence 前后强退 | 可核对恢复，无重复事实/Evidence 或幽灵完成 | AC4 |
| E09 | 关闭窗口/应用后返回原任务 | 同一 Task/Run 与审批恢复；暂停不自启，取消不复活 | AC4、AC8 |
| E10 | 外部操作已发出但回执未知且不可查询/去重 | 标记待核对，不自动重发 | AC5 |
| E11 | 旧 epoch 执行者迟到提交 | 拒绝并审计，不覆盖新 attempt | AC2、AC4 |
| E12 | 看板与协同图并发拖动/审核 | 同 revision；非法转换回滚 UI 并说明原因 | AC6 |
| E13 | WorkItem 完成但 Criterion Evidence 不足 | Task 不完成，只有 Evidence Gate 可推进 | AC3 |
| E14 | 删除可重建索引/缓存、损坏 snapshot 或撤销契约 | 前者重建；后者明确阻塞；不重做已提交动作 | AC4 |
| E15 | 请求非授权项目、FactType 或路径 | 数据层与命令层拒绝，不泄露正文/凭据 | AC7 |
| E16 | 1000 Task、50 条分页、多个 Agent 更新 | 只加载当前页摘要，交互符合 500ms 目标，编辑输入不被重建 | AC1、AC6 |

## Transport 契约矩阵

同一 fixture 分别调用 Core、Web、Desktop：

- exact-version 查询成功；facts/revision/cursor 等价。
- 旧 ontology/contract version、hash 错误、expectedRevision 冲突。
- 跨项目/越权请求在正文读取前失败。
- 同 requestId/operationId 相同内容恢复原回执，不同内容冲突。
- capability/version 缺失返回 unavailable，不走 legacy/private fallback。
- 错误响应不含绝对路径、正文、prompt、凭据或完整工具输出。

## 故障注入

每个注入点使用独立临时项目并保存退出前后 ledger 摘要：

1. intent 已写，Action 未执行。
2. Action/facts 已接纳，operation response 未返回。
3. WorkItem acceptance 已写，Evidence 未附加。
4. Evidence 已附加，Task completion response 未返回。
5. pause/cancel/approval 命令提交前后。

恢复后断言 operation/fact/Evidence 唯一、revision/cursor 单调、旧 attempt/epoch 被 fencing、未知副作用未重放。

## 平台矩阵

| 平台 | Module resolution | Preload/IPC | 强退恢复 | Evidence 状态 |
|---|---|---|---|---|
| Electron development | 待执行 | 待执行 | 待执行 | Pending |
| Windows x64 package | 待执行 | 待执行 | 待执行 | Pending |
| macOS x64 package | 待执行 | 待执行 | 待执行 | Pending |
| macOS arm64 package | 待执行 | 待执行 | 待执行 | Pending |

未在对应平台/runner 执行时必须保留 Pending；不得以另一平台结果代填。

## 自动化命令

实施时先核对实际 package scripts；至少执行：

```bash
pnpm --filter @originos/core test
pnpm --filter @originos/web test
pnpm --filter @originos/desktop test
pnpm exec tsc -p packages/core/tsconfig.json --noEmit
pnpm lint
pnpm lint:boundaries
node scripts/check-architecture-boundaries.cjs --self-test
openspec validate integrate-ontology-cross-package-adapters --strict
git diff --check
```

不存在的 script 必须记录等价命令与原因，不能当作通过。

## 测试数据

- 新 canonical project：已确认访谈、两个 ontology/contract 版本、并行 WorkItems、required/optional facts、Verifier 与 HITL。
- Legacy project：未迁移的 `Domain/Concept/Instance`、`business-model.json` 或旧 `OntologyModel`，仅验证原读取行为。
- 冲突数据：重复 ID 不同 payload、旧 revision、旧 attempt/epoch、篡改 contract hash、截断 snapshot。
- 安全数据：两个隔离项目与不同权限主体；日志/响应使用可搜索 sentinel 检查泄露。

## 人工验证

仅无法在当前 runner 自动化的打包平台执行人工 smoke：安装包启动 → 打开 fixture 项目 → 发起/暂停任务 → 强退 → 重启 → 核对 Task/Run/revision/receipt。记录平台、架构、包 hash、步骤、屏幕/日志 evidence 与结果。

## Verification Goal

实现完成后创建并完成以下验证目标：

> 逐项通过 Story ONT.8 testing.md 的 AC1–AC8、E01–E16、Web/Desktop parity 与四平台矩阵；每个失败项记录根因、修复和可复核 evidence，未执行平台与前置缺口保持 Pending。

## 完成标准与剩余风险

- 所有自动化用例、typecheck、lint、boundary self-test、strict validation 与 diff check 通过。
- E01–E16 均有真实公共 adapter/持久化 evidence。
- 四个平台独立通过或 Story 保持未完成。
- 无敏感信息泄露、私有 import、第二事实源、重复副作用或静默迁移。
- 当前剩余风险：P2.8、9.42、9.43 仍处于 Planning；在其公共能力完成前，ONT8-T1 只能完成规格与 readiness audit，不能完成联合验收。

## 变更历史

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-19 | 0.1.0 | 建立 AC、E01–E16、故障注入和平台验收矩阵 |

