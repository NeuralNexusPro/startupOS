# Tasks

## 1. Core 发布边界

- [x] 1.1 `P28-T1-A`（串行；依赖：Proposal strict validation；角色：Core solution subagent；写入：`packages/core/src/lib/features/solution/` 与定向测试）实现 `SolutionDesignSource`、检查/发布/精确读取/撤销应用服务和结构化错误；验证 confirmed gate、完整 DesignGap、确定性 hash、并发幂等、不同内容版本冲突、撤销和重启读取。证据：2026-09-25 Solution 定向 3 文件 18 tests 通过，Core typecheck 与 `git diff --check` 通过；portable commit `ded3369d727f597d39d9f47e66f91f841ec608a3` 已集成到工作树。
- [x] 1.2 `P28-T1-B`（串行；依赖：1.1；角色：Core project adapter subagent；写入：Core project solution source 与定向测试）将现有 P2.5/P2.6/P2.7 solution bundle 和 canonical ontology 适配为执行契约输入；缺失语义、verifier、权限或版本时返回 DesignGap，不填默认值；验证 legacy 不完整方案 fail closed。证据：portable commit `e8a9205c1900e752393de5c2f5b8b315e46922ce` 已集成；2026-09-25 组合回归 6 文件 37 tests 与 Core typecheck、diff check 通过。
- [x] 1.3 `P28-T1-BR`（QA 修复；依赖：1.2；角色：Core project/solution）取消 legacy solution 的隐式回退，要求调用方显式选择 `legacy_compatibility`；扩充执行语义上下文，以确认/歧义状态和来源证据门控 Concept，并为每个必需输入 FactType 要求显式状态与新鲜度策略。验证 TC-I5、SC01、SC04、无默认值和 solution feature 覆盖率。证据：Core 定向 4 文件 30 tests 通过；solution feature statements/lines 80.66%，Core typecheck 通过。

## 2. Transport 与产品交互

- [x] 2.1 `P28-T1-C`（可与 2.2 并行；依赖：1.2；角色：Web transport subagent；写入：`packages/web/src/app/api/projects/[id]/solutions/`、`packages/web/src/services/` 与 contract tests）实现薄检查、发布、读取和撤销 API/client，验证身份/参数、HTTP 错误映射、敏感信息不泄露及与 Core 响应等价。证据：portable commit `2e7328d334576266f1fab69c2ca4a0906a2be0db` 已集成；route/client 16/16、Web typecheck、929 文件边界扫描和架构 self-test 通过。
- [x] 2.2 `P28-T1-D`（可与 2.1 并行；依赖：1.2；角色：Solution UI subagent；写入：`packages/web/src/components/solution/` 与组件测试）实现发布状态面板、DesignGap 分类定位、只读 contractId/version/hash、撤销状态和“创建新版本”提示；验证键盘操作、加载/冲突/失败状态且不维护第二事实源。证据：portable commit `f58d10c9ed6ffc560793245729ed59e8ca6487f8` 已集成；组件 8/8、目标 TypeScript/ESLint 和 diff check 通过。
- [x] 2.3 `P28-T1-D-R1`（串行；依赖：2.1、2.2；角色：Solution UI remediation subagent；写入：`packages/web/src/components/solution/` 与产品交互测试）将发布面板通过 typed client 容器接入真实 `SolutionDesign` 拓扑路径；error 级 `DesignGap` 出现后锁定发布，成功复查后才恢复；发布后精确重读权威状态。证据：2026-09-25 面板、容器、真实产品入口共 3 文件 16 tests 通过，新增文件 ESLint 0 diagnostics，`git diff --check` 通过；Web 全量 typecheck 仅剩并行 9.43 投影改动导致的 `ProjectTaskBoard.test.tsx` 3 个夹具缺少新字段，未出现本任务文件错误。联合验收 3.1 保持未完成，等待其余 QA 缺口修复后复跑。

## 3. 联合验收与关闭

- [x] 3.1 `P28-T1-E`（串行；依赖：2.1、2.2；角色：Integration QA subagent；写入：测试/evidence 与 Story 文档）执行 P2.8 TC-U1–U6、TC-I1–I5、TC-C1–C2、TC-E1–E2、TC-A1 以及 SC01–SC06，补齐 P2.5/P2.6/P2.7、9.42、ONT.8 consumer 回归和中等规模 <5 秒证据。 证据：2026-09-25 Core 94、Web 34、Desktop 12 tests 通过；三包 typecheck、lint（0 error）、939 文件边界扫描、架构 self-test 通过；核心 statements/lines 96.52%，200 节点 <5 秒；完整矩阵见 `evidence/p28-t1-e-integration-acceptance.md`。
- [x] 3.2 `P28-T1-F`（串行；依赖：3.1；角色：Proposal integration owner；写入：Proposal/Story evidence 与 Git refs）运行受影响测试、三包 typecheck、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、`git diff --check` 和 `openspec validate complete-solution-execution-contract-publishing --strict`；更新 Story verification goal，合并 Task branches 到 `0.4.x` 并清理 worktree。证据：集成工作树 Core 14 files/93 tests、Web 8 files/34 tests、Desktop 2 files/12 tests 通过；三包 typecheck、lint 0 errors、939 文件边界扫描、43×2 架构自测、strict validation 与 diff check 通过。
