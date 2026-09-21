# Tasks

## 1. S15-W1 契约与 Jev adapter（串行前置）

依赖：无。写入范围：`packages/core/src/types/perception.ts`、`packages/core/src/lib/integrations/jev/**`、对应 Core 测试与 package export。负责 subagent：Core/Integration。完成证据：提交、改动文件清单、专项测试输出与无新增依赖证明。

- [x] 1.1 在独立 `proposal-task/add-jev-perception-decisions-w1-contract` 分支/worktree 定义 direct/Jev 规则联合类型、Provider summary、decision request/answer/receipt/port，并以 typecheck 验证历史 direct fixture 仍可编译
- [x] 1.2 实现基于原生 `fetch` 的 Jev adapter、3 秒总 deadline、一次有界 429/529 退避和安全错误映射，并通过 200/401/422/429/529/timeout/网络失败单测
- [x] 1.3 实现固定五问请求与 Choice/Score/Noul 严格响应校验，并以目录外 choice、缺失概率、NaN、越界及概率和异常 fixture 验证全部失败关闭
- [x] 1.4 实现 Provider `baseUrl` 信任边界校验并验证生产 HTTPS、禁止 userinfo/私网/非 HTTP(S)、开发显式 loopback 例外

## 2. S15-W2 Provider 安全配置（依赖 W1；可与 W3 并行）

依赖：W1 公共契约。写入范围：Core 非敏感 Provider config、`packages/desktop/src/main/services/**jev**`、IPC protocol/preload/service、`packages/web/src/components/os/settings/**` 与专用 service；不得修改应用其他凭据路径。负责 subagent：Desktop/Security。完成证据：提交、safeStorage/环境凭据/重启测试、浏览器存储与日志负面扫描。

- [x] 2.1 在独立 `proposal-task/add-jev-perception-decisions-w2-provider` 分支/worktree 实现非敏感 Jev Provider DataFile 与只返回 summary 的读写契约，并验证 API Key/密文/secretRef 不出现在读取结果
- [x] 2.2 实现 Desktop `safeStorage` 凭据 adapter、`TYPESAFE_API_KEY` 服务端解析和无安全存储拒绝策略，并通过保存、覆盖、保留、清除、重启恢复与 0600 文件权限测试
- [x] 2.3 增加窄 Provider IPC/Web service 边界及 body/错误映射，验证 renderer/API Route 不记录或回显 key，非 Electron 且无 SecretProvider 时返回 `SECURE_STORAGE_UNAVAILABLE`
- [x] 2.4 在现有 `SettingsDialog` 增加独立 Jev section，不扩展 `LLMProviderType` 且不写 localStorage，并通过启停、空 key 保留、清除确认、错误提示与键盘可访问组件测试

## 3. S15-W3 决策编排、回执与 Router（依赖 W1；可与 W2 并行）

依赖：W1 公共契约。写入范围：`packages/core/src/modules/perception-runtime/decision/**`、router/rule validation/storage export 与专项测试；不写 Desktop/Web。负责 subagent：Runtime。完成证据：提交、策略矩阵与 direct 路由回归输出、receipt 无敏感内容断言。

- [x] 3.1 在独立 `proposal-task/add-jev-perception-decisions-w3-runtime` 分支/worktree 实现 deterministic state redaction/hash/truncation 与版本化候选目录，并验证 secret、附件字节、raw payload 和完整外部 ID 不进入请求
- [x] 3.2 实现 Jev rule 校验、最多 20 个候选、重复/保留 key 防护和历史 direct 默认解析，并通过规则边界与无迁移回归测试
- [x] 3.3 实现 `DecisionReceiptStore`、稳定 decision id、终态恢复与新增脱敏 audit actions，并验证 DataFile 恢复、完整概率留档和 audit 不参与授权
- [x] 3.4 实现 `confidence > 0.8`、`needs_hitl < 0.5`、rule HITL、ignore/notify/dispatch 策略表，并以 0.81/0.80/缺失/NaN/HITL 全矩阵测试验证
- [x] 3.5 将可选 DecisionOrchestrator 插入 `PerceptionRouter` 的授权后/lease 前，验证无授权候选不调用 Jev、dispatch 复用既有 lease/execution、direct 路由与 Connector 接纳回归不变

## 4. S15-W4 Desktop 装配与人工解决（依赖 W2、W3；串行）

依赖：W2 安全 Provider 与 W3 runtime。写入范围：Desktop Perception Plugin Host/service/IPC、Core perception management facade 与集成测试。负责 subagent：Runtime/Desktop。完成证据：提交、自动/人工端到端 fake-provider 测试、重复执行计数为 1。

- [ ] 4.1 在独立 `proposal-task/add-jev-perception-decisions-w4-runtime-wiring` 分支/worktree 将 Provider snapshot、Jev adapter 与 DecisionOrchestrator 注入现有 Desktop Host，验证配置热更新只影响下一请求且 Provider 故障不阻塞 direct/其他 connector
- [ ] 4.2 实现 pending decision 查询、resolve/retry 窄用例与 Desktop IPC，人工提交时重新校验目标存在性、grant、connector/rule scope 与 HITL
- [ ] 4.3 让自动与人工 dispatch 使用同一 decision id/`ExecutionLease`/`TriggerExecutionPort`，以重复事件、重复按钮和并发不同选择验证只产生一次副作用并恢复原 resultRef
- [ ] 4.4 复用现有系统通知提示 pending decision，验证通知失败只记录安全诊断且不改变 receipt pending 状态

## 5. S15-W5 规则与事件交互（依赖 W1；可与 W4 并行，集成时串行）

依赖：W1 UI 契约；合并前必须与 W4 IPC 结果对齐。写入范围：`packages/web/src/components/os/sense-center/RuleWizard.tsx`、`SenseCenter.tsx`、perception store/services 与组件测试。负责 subagent：Web/UX。完成证据：提交、组件测试截图/输出、无新增页面和配置轮询证明。

- [ ] 5.1 在独立 `proposal-task/add-jev-perception-decisions-w5-ui` 分支/worktree 为规则向导增加 direct/Jev 模式、授权候选多选与固定阈值说明，并验证无授权候选、Provider 未配置、0.8 文案和草稿保持
- [ ] 5.2 扩展规则卡和事件 trace 展示 decision 版本、候选概率、confidence、HITL 原因、lease/resultRef，验证长候选折叠、400×300 单列和键盘/读屏语义
- [ ] 5.3 实现低置信/Provider 失败的选择、忽略与重试交互，验证失效候选禁用、已解决操作禁用、重复点击恢复既有结果且不猜测默认目标
- [ ] 5.4 复用事件页现有 5 秒刷新并验证配置页不新增轮询、store 更新不重建 Provider/规则表单

## 6. S15-W6 集成、验证与交付（依赖 W2–W5；串行）

依赖：所有实现工作包。写入范围：Proposal 主 worktree 的冲突解决、Story/OpenSpec、AGENTS.md、`docs/changes/` 与验证记录；不得在主 worktree直接实现应用源码。负责角色：Tech Lead/QA。完成证据：合并提交、完整命令日志、Story verification goal 结果与回滚记录。

- [ ] 6.1 逐个审查并合并 W1–W5 Task 分支到 `proposal/add-jev-perception-decisions`，每次合并后运行受影响测试并记录 commit、文件和未解决项
- [ ] 6.2 创建并完成自动化测试验证 goal“通过 Story SENSE.15 中定义的全部测试 case”，执行 Core/Desktop/Web 专项、typecheck/build、`pnpm lint`、`pnpm lint:boundaries` 与架构 self-test，并把真实结果写入 `testing.md`
- [ ] 6.3 使用约 100 条脱敏标注事件评估误路由率、漏升级率、人工介入率与 confidence 校准，验证 0.8 边界和 p95/3 秒 deadline；无法自动化的真实 Jev/Desktop safeStorage 步骤必须记录人工证据和剩余风险
- [ ] 6.4 同步新增数据路径/公共契约到 AGENTS.md、Epic README、文档索引和全量/版本 changelog，并运行占位符扫描证明 Story 六份文档可实施
- [ ] 6.5 运行 `openspec validate add-jev-perception-decisions --strict`、核对全部 AC 与回滚演练；仅在实现和证据齐全后勾选完成项并提交审查
- [ ] 6.6 Proposal 获批且完整验证后合并到 `dev`，再清理已合并 Proposal/Task worktree 与分支并记录清理结果
