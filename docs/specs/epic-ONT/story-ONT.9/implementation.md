# 开发文档 - Story ONT.9

**Story:** Agent 工具与遗留写入口的本体治理
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 🎯 开发目标

消灭全部 legacy 本体写入口：Agent 工具（结构层 + 实例层）迁 `CanonicalOntologyAuthoringService`（补 `instance.*` 命令）、Web `/api/ontology-data/*` 写路由只读化、已 canonical 项目 legacy 残留经同一通道并入。

---

## 📋 实施步骤（OpenSpec Task 拆分预演）

### ONT9-T1-A：authoring instance.* 命令（串行，前置）

**写入：** `packages/core/src/lib/features/ontology/authoring-types.ts`、`authoring-service.ts`（mutateOntology 三 case）、`__tests__/`（authoring instance 测试）

1. `authoring-types.ts`：`CanonicalOntologyAuthoringMutation` 联合新增 `instance.create/update/delete`（形状见 architecture.md）
2. `authoring-service.ts` `mutateOntology`：
   - `instance.create`：id 唯一、conceptId 命中 `concepts[].id`、`data` 为 Record → push
   - `instance.update`：instanceId 存在、patch 无 `conceptId` 键 → 合并
   - `instance.delete`：instanceId 存在、无 relation 引用 → 删除
3. 测试：合法创建/更新/删除、conceptId 不存在拒绝、重复 id 拒绝、CAS 冲突、幂等 operationId、relation 引用拒绝删除、patch 改 conceptId 拒绝

**验收：** ontology feature 定向 vitest 全绿；core tsc 零新增错误

### ONT9-T1-B：Agent 结构层工具迁移（串行，依赖 A）

**写入：** `packages/core/src/lib/features/agent/tools/ontology-tools.ts`、`__tests__`（如有）

1. 新增内部 `resolveAuthoringContext(ontologyId)`：读 canonical store，得 projectId/version/revision；无 canonical → 结构化 `MIGRATION_REQUIRED` 错误
2. `create_domain` → `domain.create`；`create_concept` → `concept.create`（含 `domainId` 命中校验，authoring validator 自带）
3. 移除 `ontologyOps.createDomain/createConcept` 调用与相关 import（保留 `loadOntology`/`searchOntology` 只读）
4. 失败映射：authoring issues → 工具 `{ success: false, error }`；CAS 冲突内自动重试一次
5. 测试：工具 execute 成功写 canonical（临时 dataRoot）、legacy 文件零触碰、未迁移项目返回 MIGRATION_REQUIRED、冲突重试

**验收：** agent tools 定向 vitest 全绿；grep 无 `ontologyOps.create*` 残留

### ONT9-T1-C：Agent 实例层工具迁移（串行，依赖 A、B）

**写入：** `packages/core/src/lib/features/agent/tools/ontology-data-tools.ts`

1. `create_instance` → `instance.create`：`fields`→`data`、conceptId 反查 domain、生成 `inst-` 或复用 legacy id 形态（保 id 生成策略一致即可）
2. `update_instance` → `instance.update`（patch.data 整体替换 + meta 丢弃）；`delete_instance` → `instance.delete`
3. 只读工具（`get_instance`/`query_instances`/`list_concepts`/`get_concept_schema`/`query_ontology`/`search_ontology`）改读 canonical（instances/concepts 直读 + 简单过滤实现既有查询参数语义）
4. 实例关系工具（若有暴露）→ `relation.*` 命令或 canonical 现有关系形态
5. 移除 `store.create/update/deleteInstance` 与 `saveOntology` 依赖

**验收：** 定向 vitest 全绿；`grep store.createInstance` 等零残留；既有 `ontology-data-tools` 行为测试迁移后语义等价

### ONT9-T1-D：Web 写路由只读化 + 死代码清理（可与 B/C 并行）

**写入：** `packages/web/src/app/api/ontology-data/**/route.ts`、`packages/web/src/components/os/data-editor/OntologyConceptGraphEditor.tsx`（删除）、`data-editor/index.ts`

1. 所有写 handler（POST/PUT/PATCH/DELETE + sync POST）替换为统一结构化拒绝（`CANONICAL_EDIT_UNAVAILABLE`），删除全部 `fs.writeFile`/目录创建副作用
2. 确认 `OntologyConceptGraphEditor` 零渲染引用后删除组件与 index 导出（连带移除 `getConceptSchema` 依赖）
3. route 测试更新：写请求 → 拒绝断言

**验收：** web 定向 vitest；`grep -r "writeFile" packages/web/src/app/api/ontology-data/` 零命中

### ONT9-T1-E：集成回归 + 残留并入（串行，依赖 A–D）

**写入：** Proposal evidence、`scripts/`（并入脚本）、Story 文档

1. 合并 Task 分支；全量定向回归（ontology feature + agent tools + web api + workspace/data-editor）
2. `pnpm lint` / `lint:boundaries` / exports 门禁 / 架构自测
3. 并入脚本：dry-run 列出行政办公项目 legacy∪canonical 差集 → 确认 → 经 authoring 命令补录 → 验证幂等（二次执行零变化）→ Web 本体页签视觉确认
4. legacy 文件 mtime/content 前后对比，确认未修改

**验收：** AC4/AC5 证据齐备

---

## 📁 文件级改动范围（预期）

```
packages/core/src/lib/features/ontology/authoring-types.ts        | +12
packages/core/src/lib/features/ontology/authoring-service.ts      | +45
packages/core/src/lib/features/ontology/__tests__/…               | +180
packages/core/src/lib/features/agent/tools/ontology-tools.ts      | ~80 改
packages/core/src/lib/features/agent/tools/ontology-data-tools.ts | ~200 改
packages/web/src/app/api/ontology-data/**/route.ts                | -150 写逻辑
packages/web/src/components/os/data-editor/OntologyConceptGraphEditor.tsx | 删除
scripts/ontology/merge-legacy-residue.mjs（或等价）                | +120 新增
```

---

## 🔄 迁移/兼容

- 无数据 schema 变更；authoring JSONL 追加新 commandType
- legacy 只读不受影响；写入面清零后 legacy 目录成纯历史
- `ontology-data-store` 写函数保留（测试与 store 内部使用），生产消费面清零由 AC5 grep 证据保证

## 🔍 审查要点

- instance.update 的 patch 是否允许改 conceptId（设计：不允许）
- 只读查询迁 canonical 后的语义差异（分页/排序参数是否保持）
- 并入去重键（name+type）是否足够（同项目同 domain 下同名概念在 canonical 已唯一）
- 工具错误码与 desktop `CANONICAL_EDIT_UNAVAILABLE` 一致性

## 🔙 回滚风险

- 工具 revert 即回 legacy 写（会重新打开双写窗口，回滚需谨慎）
- authoring 新命令为纯增量，无需数据回滚
- 并入脚本幂等可重跑，最坏情况是重复执行无变化
