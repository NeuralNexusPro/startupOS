# Tasks

## 1. canonical authoring instance 命令（串行前置）

- [x] 1.1 `ONT9-T1-A`（串行；依赖：Proposal 批准；角色：Core ontology authoring subagent；写入：`packages/core/src/lib/features/ontology/authoring-types.ts`、`authoring-service.ts`、`packages/core/src/lib/features/ontology/__tests__/`）实现 `instance.create/update/delete` 命令：instance.create 校验 conceptId 存在与 id 唯一；instance.update 仅允许 `data`（整体替换）/`stateId`/`sourceRefs` patch、`conceptId`/`id`/`createdAt` 不可变；instance.delete 校验无 CanonicalInstanceRelation 引用；全部经既有 CAS/幂等/权限/validator 通道。测试覆盖正反例（引用不存在、重复 id、幂等重放、CAS 冲突、patch 改 conceptId 拒绝、relation 引用拒绝删除）。验证：ontology feature 定向 vitest、core tsc 零新增错误。

## 2. Agent 工具迁移（结构层串行，实例层随后；Web 可并行）

- [x] 2.1 `ONT9-T1-B`（串行；依赖：1.1；角色：Core agent tools subagent；写入：`packages/core/src/lib/features/agent/tools/ontology-tools.ts` 与定向测试）`create_domain`/`create_concept` 迁 `CanonicalOntologyAuthoringService`（`resolveAuthoringContext` 解析 projectId/version/revision；operationId=`tool-{toolCallId}`；audit.source=`agent-tool`；CAS 冲突自动重试一次；无 canonical 返回 `MIGRATION_REQUIRED`）；移除 `ontologyOps.createDomain/createConcept` 写消费。验证：工具集成测试（临时 dataRoot）断言 canonical 更新且 legacy 文件字节不变。
- [x] 2.2 `ONT9-T1-C`（串行；依赖：2.1；角色：Core agent tools subagent；写入：`packages/core/src/lib/features/agent/tools/ontology-data-tools.ts` 与定向测试）`create_instance/update_instance/delete_instance` 迁 `instance.*` 命令（fields→data、meta 丢弃、domainId 反查）；只读工具按 D4 策略读 canonical（有 canonical 读 canonical，否则 legacy 只读）；实例关系走 relation 命令或 canonical 既有形态；移除 `store.create/update/deleteInstance` 写消费。验证：工具集成测试（含查询语义 fixture 对比、legacy 零触碰断言）。
- [x] 2.3 `ONT9-T1-D`（可与 2.1/2.2 并行；依赖：无（不依赖 1.1）；角色：Web API subagent；写入：`packages/web/src/app/api/ontology-data/**/route.ts`、`packages/web/src/components/os/data-editor/OntologyConceptGraphEditor.tsx`（删除）、`data-editor/index.ts` 与 route 测试）全部写 handler 收敛为 `CANONICAL_EDIT_UNAVAILABLE` 结构化拒绝（405），删除全部 `fs.writeFile`/目录创建副作用；确认零渲染引用后删除 OntologyConceptGraphEditor 死组件与其 index 导出；GET 只读行为保持。验证：route 测试（写拒绝 + GET 保留）、grep writeFile 零命中、web typecheck。

## 3. 集成回归与残留并入（串行收尾）

- [x] 3.1 `ONT9-T1-E`（串行；依赖：2.2、2.3；角色：Proposal integration owner；写入：Proposal evidence、`scripts/ontology/merge-legacy-residue.mjs`（一次性并入脚本）、Story 文档测试记录）合并 Task 分支；运行 ontology feature + agent tools + web 定向回归、`pnpm lint`、`pnpm lint:boundaries`、exports 门禁、架构自测、`git diff --check`；对行政办公项目（proj-1791616381403-flcx7qded）执行残留并入三步证据（dry-run 清单 → authoring 命令补录 → 幂等复跑），legacy 文件 mtime/字节前后不变；AC5 grep 三命令零输出留档。
- [ ] 3.2 `ONT9-T1-F`（串行；依赖：3.1；角色：Proposal integration owner；写入：本 change 任务勾选、Story/Epic 状态、Git refs）`openspec validate --strict` 通过后经用户批准合并到 `dev`；更新 Story ONT.9 README/Epic README 状态；清理 worktree。
