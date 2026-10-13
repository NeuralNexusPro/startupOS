# Proposal: govern-ontology-write-entrypoints

- **epic-id:** ONT
- **story-id:** ONT.9
- **task-id:** ONT9-T1
- **状态:** draft（待审查批准）
- **日期:** 2026-10-12

## Why

canonical ontology 是唯一事实源，但生产源码仍有三类写入 `data/projects/{projectId}/ontology/`（legacy）的活跃入口：

1. **Agent 工具（结构层）**：`ontology-tools.ts` 的 `create_domain`/`create_concept` 经 legacy `ontology-data-store` 写 legacy 文件。
2. **Agent 工具（实例层）**：`ontology-data-tools.ts` 的 `create_instance`/`update_instance`/`delete_instance` 同上。
3. **Web API**：`/api/ontology-data/*` 全部写路由直接 `fs.writeFile` legacy 文件（UI 消费方已全部迁 canonical，属死通道）。

实发事故：2026-10-12 行政办公项目（已有 canonical 13 概念）的 Supervisor 会话经上述工具向 legacy 写入 4 概念 + 1 实例，形成双事实源。canonical authoring 命令集（`add-canonical-ontology-authoring-actions` 已合并）尚无 `instance.*` 命令，实例层迁移存在能力缺口。

用户决策（2026-10-12）：全量治理一次做完；已 canonical 项目的 legacy 残留数据并入 canonical，legacy 文件原地保留。

## 影响范围

### 变更内容

1. **canonical-ontology-authoring 新增 `instance.create/update/delete` 命令**（ADDED，capability `canonical-ontology-authoring`）：复用既有 revision CAS、operationId 幂等、权限门控、validator 全量校验与 authoring JSONL 审计；实例删除受关系引用完整性约束。
2. **Agent ontology 工具迁 canonical**（ADDED，capability `agent-ontology-tools`，新 capability）：结构层与实例层写工具全部经 authoring 通道提交；只读工具读 canonical；未迁移项目返回结构化 `MIGRATION_REQUIRED`；生产源码中 legacy 写函数消费面清零。
3. **Web `/api/ontology-data/*` 写路由只读化**（ADDED，capability `agent-ontology-tools` 内约束或独立 Scenario）：写请求返回 `CANONICAL_EDIT_UNAVAILABLE`，删除全部 legacy 文件写入代码路径。
4. **已 canonical 项目 legacy 残留并入**（ADDED，capability `legacy-ontology-migration`）：显式触发（脚本/手动调用公共函数）、按 name+type 去重、补录条目带 sourceRefs、幂等可重跑、legacy 文件原地保留。

### 不变更

- legacy 只读查询行为（`query_ontology`/`search_ontology` 等读路径迁移属 ONT.8；本 Proposal 只要求写入口清零，读路径允许继续读 legacy 或改为读 canonical，以实现最小扰动为准）
- Desktop `ontology-data:*` 读路径（ONT.8）
- `migrateLegacyOntology` 既有迁移 API 语义（仅适用于「无 canonical → 有 canonical」，本次不改动）
- 无 canonical 旧项目的自动迁移（AGENTS.md 禁止静默迁移，维持显式入口）

## 依赖与风险

**依赖：**
- `add-canonical-ontology-authoring-actions`（已合并）：authoring service/CAS/审计基座
- ONT.2/ONT.4（Done）：store 与 validator

**风险与缓解：**
- instance.update 的 patch 语义与 concept.update 不一致风险 → 设计固定为「data 整体替换、conceptId 不可变」，测试锁定
- 并入去重键（name+type）在边界数据下误判 → dry-run 清单先行人工确认，再执行
- 工具迁移后回滚会重新打开双写窗口 → 单 commit 粒度 revert，Story 记录回滚步骤

## 验收

- Story ONT.9 AC1–AC6 全部通过（见 `docs/specs/epic-ONT/story-ONT.9/testing.md`）
- `openspec validate govern-ontology-write-entrypoints --strict` 通过
- 生产源码 grep 证据：legacy 写函数消费面清零
- 行政办公项目并入证据：dry-run/执行/幂等三步输出 + canonical diff

## Task 拆分（对应 tasks.md）

- ONT9-T1-A：authoring instance.* 命令（串行，前置）
- ONT9-T1-B：Agent 结构层工具迁移（串行，依赖 A）
- ONT9-T1-C：Agent 实例层工具迁移（串行，依赖 A/B）
- ONT9-T1-D：Web 写路由只读化 + 死代码清理（可与 B/C 并行）
- ONT9-T1-E：集成回归 + 残留并入执行（串行，依赖 A–D）
