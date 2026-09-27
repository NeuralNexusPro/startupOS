# Tasks

## 1. Canonical authoring 核心

- [x] 1.1 `ONT-AUTHORING-T1-A`（串行；依赖：Proposal 严格校验与用户批准；角色：Core ontology authoring subagent；写入：`packages/core/src/lib/features/ontology/` 和定向测试）实现 authoring DTO、revision/receipt store 与命令 service，覆盖合法编辑、权限、完整校验、并发 CAS、幂等重试、operation 冲突和失败零写入；验证 Core 定向测试与 strict typecheck。

## 2. 跨包编辑适配

- [x] 2.1 `ONT-AUTHORING-T1-B`（串行；依赖：1.1；角色：Ontology adapters subagent；写入：公共 electron bridge、`packages/desktop/src/main/services/ontology-data-service.ts`、canonical Web API route 和定向测试）将结构编辑命令映射到 Core authoring service，保持实例与 legacy sync 写入不可用；验证 Desktop/Web 定向测试和 typecheck/build。
- [x] 2.2 `ONT-AUTHORING-T1-C`（串行；依赖：2.1；角色：Ontology editor UI subagent；写入：`packages/web/src/components/os/data-editor/`、workspace adapter 与定向测试）让领域、概念、属性/schema、关系编辑携带权威 ref/revision/operationId 并在冲突时刷新；验证组件测试和 Desktop `desktop:dev` 可用路径。

## 3. 集成与验收

- [x] 3.1 `ONT-AUTHORING-T1-D`（串行；依赖：1.1–2.2；角色：Proposal integration owner；写入：OpenSpec/Story 证据和集成分支）运行定向回归、Core/Web strict typecheck、Desktop build、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、`git diff --check` 与 OpenSpec strict validation，记录 Story verification goal 和未验证项。
- [x] 3.2 `ONT-AUTHORING-T1-E`（串行；依赖：3.1；角色：Proposal integration owner；写入：任务/Story 状态和本地 Git refs）审查并合并 Task 分支到本地 `0.4.x`，更新完成证据；不触碰独立 packaging 脚本，不推送、不打包、不清理保留现场，除非用户另行授权。

