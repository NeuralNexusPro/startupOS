# Tasks

## 1. 前置门与契约冻结

- [x] 1.1 `ONT8-T1-A`（串行；依赖：Proposal 明确批准；角色：集成架构 subagent；写入：本 change 的 readiness evidence）核对 ONT.1–ONT.7、P2.8、9.42、9.43 与受控 pi-tasks adapter 的公共 API、版本及完成证据；以接口清单和缺口报告验证所有必需边界存在，任一缺失时停止应用源码实施。完成证据：2026-09-22 用户明确要求推进 ONT.8；strict validation 通过；`evidence/readiness-audit.md` 确认 P2.8、9.42、9.43 与 pi-tasks adapter 缺口，应用源码实施按门禁停止。
- [x] 1.2 `ONT8-T1-B`（串行；依赖：1.1；角色：Core contract subagent；写入：`packages/core/src/lib/features/project/` 公共 DTO/ports 与类型测试）冻结版本化请求、响应、错误和 transport parity contract；以 TypeScript 正反例、core typecheck 和公共导出测试验证无 `any`、无私有导入。完成证据：新增 `ontology-cross-package-contract.ts` 并由 `project/index.ts` 公共导出；`tsc --noEmit` 通过；定向 contract tests 3/3 通过，覆盖版本锁定、非法版本和 mutation 必填 revision 正反例。

## 2. Core 应用服务

- [x] 2.1 `ONT8-T1-C`（串行；依赖：1.2；角色：Core service subagent；写入：`packages/core/src/lib/features/project/` service、exports、unit/integration tests）实现精确 ontology/contract/task/run scope 门控与只读聚合；以旧版本、越权、跨项目、缺失能力和投影重建测试验证 fail closed 且无第二事实源。完成证据：新增 `ontology-cross-package-service.ts` 并由 `project/index.ts` 公共导出；core `tsc --noEmit` 通过；定向 service tests 4/4 通过，覆盖语义上下文、投影失败、只读 task 检查和 mutation `CAPABILITY_NOT_READY` fail closed。
- [x] 2.2 `ONT8-T1-D`（串行；依赖：2.1；角色：恢复协议 subagent；写入：同一 Core service 的 mutation/recovery 路径与测试）接通 intent → OSDK receipt → WorkItem acceptance → Evidence 对账；以重复 ID、内容冲突、旧 epoch、Action 后崩溃和未知外部回执测试验证不重复副作用。完成证据：扩展版本化 mutation 契约与 WorkItem/Evidence 恢复端口，Core service 接通 OSDK 幂等提交、精确 contract/task/run 校验、Run 启动与 Task 控制；13/13 定向 service tests 与 3/3 contract tests 覆盖重复请求、内容冲突、Action 后中断、旧 lease epoch、未知外部回执和 fail-closed 启动，core `tsc --noEmit` 通过。

## 3. Transport Adapters

- [x] 3.1 `ONT8-T1-E`（可与 3.2 并行；依赖：2.2；角色：Web adapter subagent；写入：`packages/web/src/app/api/` ONT8 route 与 route tests）实现参数/身份解析、Core 调用和 HTTP 映射；以 Web contract tests 验证业务逻辑未进入 route、错误不泄露正文或路径。完成证据：新增 `/api/ontology/cross-package` 薄 route 与 Web service 装配；route 从 `x-originos-actor-id` 注入身份、校验 v1 contract 和 mutation revision，复用同一 Core service，并映射 400/401/403/409/500/503；6/6 route tests 覆盖身份注入、类别映射、非法 JSON、非法版本/revision、缺失生产能力和敏感错误不泄露，web `tsc --noEmit` 通过。生产 Task source 与 WorkItem recovery 缺失时按 `CAPABILITY_NOT_READY` fail closed。
- [ ] 3.2 `ONT8-T1-F`（可与 3.1 并行；依赖：2.2；角色：Desktop adapter subagent；写入：`packages/desktop/src/main/`、preload/IPC contract 与 tests）实现 sender/channel 校验、Core 调用和 `IpcResponse` 映射；以 IPC allowlist、无效 sender、版本冲突和打包模块解析测试验证边界。
- [ ] 3.3 `ONT8-T1-G`（串行；依赖：3.1、3.2；角色：Contract QA subagent；写入：跨包 parity fixture/tests）用同一输入矩阵比较 Web 与 Desktop 规范化响应；以成功、授权失败、版本冲突、幂等重试和 unavailable 场景证明 transport 语义等价。

## 4. 端到端与平台验收

- [ ] 4.1 `ONT8-T1-H`（串行；依赖：3.3；角色：E2E QA subagent；写入：临时项目 fixture、跨包 integration tests、Story testing evidence）执行 E01–E07、E12–E16，覆盖访谈→方案→Task/Run→Verifier/Evidence→看板的成功、设计缺口、版本隔离、并发和 1000 Task/50 条分页场景；逐项记录可复核测试输出。
- [ ] 4.2 `ONT8-T1-I`（串行；依赖：4.1；角色：Recovery QA subagent；写入：故障注入 harness 与 Story testing evidence）执行 E08–E11，在 intent、Action、接纳、Evidence 前后强退并验证重启、暂停、取消、未知副作用与旧 lease；完成证据必须证明无重复 fact/Action/Evidence 和无幽灵完成。
- [ ] 4.3 `ONT8-T1-J`（可按平台并行；依赖：4.2；角色：Packaging QA subagent；写入：desktop test scripts/workflow 与平台 evidence，不修改业务实现）验证 development、Windows x64、macOS x64/arm64 的 module resolution、preload channel 和进程恢复 smoke；每个平台保留独立日志，未执行项不得标记通过。

## 5. 回归、审查与集成

- [ ] 5.1 `ONT8-T1-K`（串行；依赖：4.3；角色：Proposal integration owner；写入：Proposal worktree 的任务/测试证据）合并各 Task branch 后运行受影响 package tests、`pnpm lint`、`pnpm lint:boundaries`、`node scripts/check-architecture-boundaries.cjs --self-test`、core typecheck 与 `git diff --check`；记录命令、结果和既有 warning，任何失败保持未完成。
- [ ] 5.2 `ONT8-T1-L`（串行；依赖：5.1；角色：Verification owner；写入：`docs/specs/epic-ONT/story-ONT.8/testing.md`）完成 Story verification goal，将每条 AC 和 E01–E16 映射到自动化或人工 evidence，明确未验证平台与剩余风险。
- [ ] 5.3 `ONT8-T1-M`（串行；依赖：5.2；角色：Proposal integration owner；写入：本 change 与 Git refs/worktrees）运行 `openspec validate integrate-ontology-cross-package-adapters --strict`，完成架构/安全审查，更新真实完成项，再将 Proposal 分支合并到 `dev` 并清理已合并 Task/Proposal worktree；以 validation 输出、merge commit 和干净 worktree 列表为证据。
