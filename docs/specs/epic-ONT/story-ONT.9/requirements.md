# 需求文档 - Story ONT.9

**Story:** Agent 工具与遗留写入口的本体治理
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 📋 功能需求

### 来源

- AGENTS.md「本体构建系统架构」：canonical ontology 唯一事实源、旧模型迁移约束、legacy compatibility projection 仅供读取不得成为第二写入事实源
- AGENTS.md「数据存储规约」：本体数据存储在 `{project-root}/data/ontology/`
- 2026-10-12 用户治理决策（AskUserQuestion）：全量一次做完 + 存量并入 canonical
- 实发双写事故（行政办公项目 2026-10-12 19:50，见 README 背景）

### 详细需求

#### FR1: Agent 结构层工具迁 canonical authoring

**描述：**
`packages/core/src/lib/features/agent/tools/ontology-tools.ts` 的 `create_domain`、`create_concept` 工具改为经 `CanonicalOntologyAuthoringService` 提交 `domain.create`/`concept.create` 命令：
- 工具入参保持 `ontologyId` + 名称/类型/描述；实现内部经 `ProjectOntologyEntryService`（或 canonical store 读取）由 ontologyId 解析出 `projectId`/`ontologyVersion`/当前 `expectedRevision`
- `operationId` 按工具调用生成（如 `tool-{toolCallId}`），`permissions` 含 `CANONICAL_ONTOLOGY_AUTHOR_PERMISSION`，`audit.source` 标记 `"agent-tool"`
- 冲突（revision CAS 失败）时返回结构化错误并提示重试；成功返回 canonical 概念/领域 payload
- 不再 import `ontology-data-store` 的写函数；`query_ontology`/`search_ontology` 只读路径保持现有行为（可继续读 legacy 只读或改读 canonical，实施时按最小改动决定，但不得新增 legacy 写）

**优先级：** 🔴 High
**依赖：** Proposal `add-canonical-ontology-authoring-actions`（已合并）

#### FR2: canonical authoring 补 instance.* 命令集

**描述：**
在 `packages/core/src/lib/features/ontology/`（`authoring-types.ts` + `authoring-service.ts` + validator 协同）新增：
- `instance.create`：`value: CanonicalInstance`（id、conceptId 必填；conceptId 必须存在于当前 ontology，validator 交叉引用校验）
- `instance.update`：`instanceId` + `PlainPatch<CanonicalInstance>`（不允许改 conceptId；`data` 整体替换语义与现有 concept.update 的 patch 语义一致）
- `instance.delete`：`instanceId`
- 全部走既有 `compareAndSwapAuthoring` 通道：revision CAS、operationId 幂等、authoring JSONL 审计、失败零写入、canonical validator 全量校验
- 单测覆盖：合法创建、conceptId 不存在拒绝、重复幂等、CAS 冲突、畸形 value 拒绝、delete 后引用残留拒绝

**优先级：** 🔴 High
**依赖：** ONT.2 store、ONT.4 validator（均已 Done）

#### FR3: Agent 实例层工具迁 canonical instance 命令

**描述：**
`packages/core/src/lib/features/agent/tools/ontology-data-tools.ts` 的 `create_instance`、`update_instance`、`delete_instance` 改为经 FR2 的 instance.* 命令写入 canonical：
- 字段映射：legacy `fields` → canonical `data`；`meta`（createdAt/updatedAt/createdBy/version）不进 canonical（canonical 自维护 createdAt/updatedAt）；`domainId` 由 conceptId 反查
- 实例关系（`createInstanceRelation`/`deleteInstanceRelation`）映射到 canonical `relation.create`/`relation.delete` 或按 CanonicalInstanceRelation 既有形态处理（实施时依 canonical types 现状决定，禁止引入第三种关系存储）
- 只读工具（`get_instance`/`query_instances`/`get_concept_schema`/`list_concepts`）改为读 canonical（instances/concepts 直读），查询语义保持（过滤/分页/排序参数不破坏）
- 读路径迁移后，`query_instances` 等不得再读 legacy `data/` 目录

**优先级：** 🔴 High
**依赖：** FR2

#### FR4: Web /api/ontology-data 写路由只读化

**描述：**
`packages/web/src/app/api/ontology-data/` 下所有路由（domains、domains/[id]、concepts、concepts/[id]、concepts/[id]/schema、instances、instances/[id]、relations/concepts、relations/instances、sync）：
- 全部写操作（POST/PUT/PATCH/DELETE 及 sync 的 POST）返回结构化 `CANONICAL_EDIT_UNAVAILABLE`（409 或 405 语义，与 desktop 现有错误码一致），响应体说明「本体编辑请使用 canonical 入口」
- 删除路由内全部 `fs.writeFile` legacy 写代码（含 `_index.json`、关系文件、版本目录创建等副作用）
- GET 只读路径：本 Story 不强制迁 canonical（属 ONT.8 范围），但不得因本次改动破坏既有只读行为
- 唯一已知读消费者 `OntologyConceptGraphEditor.getConceptSchema`（无渲染入口的死代码）随本次一并评估：若确认死代码则直接删除该组件与 index 导出，连带消除该 legacy 读依赖

**优先级：** 🔴 High
**依赖：** 无（可与 FR1 并行）

#### FR5: 已 canonical 项目的 legacy 残留并入

**描述：**
提供一次性并入路径（脚本或 core 公共函数 + 手动执行，不做自动迁移）：
- 输入：legacy `ontology.json`（`data/projects/{projectId}/ontology/`）+ 已有 canonical ontology
- 行为：按名称+类型识别 legacy 概念与 canonical 的重复（行政办公：员工/请假单/考勤记录/部门 vs canonical 已有同名），仅将 canonical 缺失的概念、实例、领域经 authoring 命令补录 canonical；补录条目带 `sourceRefs`（sourceKind `'ontology'`、sourceId 指向 legacy 文件相对路径）
- 幂等：重复执行不产生重复条目（按名称+类型去重）
- legacy 文件原地保留（历史备份），不删除不修改
- 对行政办公项目实际执行一次并入（4 概念去重后应为 0 新概念 + 实例「行政部」并入），并入后 Web 本体页签可见

**优先级：** 🔴 High
**依赖：** FR1、FR2（复用 authoring 命令）

---

## ✅ Given/When/Then 验收标准

### AC1: 结构层工具写 canonical

**Given** 一个已 canonical 化的项目（ontologyId 存在）
**When** Agent（supervisor/project scope）调用 `create_domain` 或 `create_concept`
**Then** canonical ontology 新增该领域/概念（authoring JSONL 有审计记录、revision +1），legacy `ontology.json` 字节不变；Web 本体页签刷新后可见

### AC2: 实例命令与工具

**Given** 同上项目
**When** Agent 调用 `create_instance`/`update_instance`/`delete_instance`
**Then** canonical instances 增改删，revision CAS 生效，重复 operationId 幂等返回既有回执，legacy `data/` 子目录与版本目录不再新增文件

### AC3: Web 写路由拒绝

**Given** 任意项目
**When** 向 `/api/ontology-data/*` 发起 POST/PUT/DELETE（含 sync）
**Then** 返回结构化只读拒绝错误；`grep` 确认路由文件零 `writeFile` 调用

### AC4: 残留并入

**Given** 行政办公项目（canonical 13 概念 + legacy 4 概念/1 实例）
**When** 执行并入
**Then** canonical 概念数 = max(13, 13∪4 去重数)，实例「行政部」出现在 canonical；legacy 文件 mtime 与内容不变；重复执行 canonical 不再变化

### AC5: 写路径清零

**Given** 生产源码（非测试）
**When** 检索 legacy 写函数（`saveOntology`、`createDomain`、`createConcept`、`createInstance`、`updateInstance`、`deleteInstance`、`createInstanceRelation`、`deleteInstanceRelation`）的全部调用方
**Then** 仅剩：测试、ontology-data-store 内部、以及 Agent 工具中已迁走后的无残留；`lint:boundaries` 通过

### AC6: 回归零破坏

**Given** 既有测试套件
**When** 运行 ontology feature、agent tools、web data-editor/workspace、interview 相关定向测试
**Then** 除既有基线失败外零新增失败

---

## 🧭 边界条件

- legacy 文件不存在（新项目）：工具写入时不得创建 legacy 文件，只写 canonical
- ontologyId 无对应 canonical（未迁移旧项目调用工具）：返回结构化 `MIGRATION_REQUIRED` 类错误，提示先走显式迁移（Desktop `project:legacy-ontology:migrate` 已有）
- canonical validator 校验失败（如概念引用不存在的 domainId）：authoring 拒绝、零写入、返回 validator issues
- 并发两个工具调用同时写：CAS 保证一个成功一个结构化冲突，不产生交错损坏
- 实例 data 中含 legacy 特有字段（如 `meta`）：按 FR3 映射丢弃 meta，业务字段全保留

## ⚠️ 异常场景

- authoring 服务异常（磁盘故障）：工具返回失败 result，Agent 会话可感知，不静默丢数据
- 并入脚本遇到 legacy JSON 损坏：跳过该条并报告，不中断其余条目
- Web 写路由拒绝不得泄漏文件路径（响应体仅错误码 + canonical 指引文案）

## 🔗 依赖关系

- 前置：ONT.2/ONT.4（Done）、`add-canonical-ontology-authoring-actions`（Done）
- 不依赖：ONT.8 剩余平台矩阵（读取通道迁移属 ONT.8，本 Story 只管写入边界）
- 后续：instance.* 命令为 OSDK facts/Action 提交边界（ONT.5）的实例面补全，不改变其 API

## 📊 非功能需求

- 性能：工具单次写入（含 validator 全量校验）< 5s（对齐 AGENTS.md 本体查询指标）
- 审计：全部写入有 authoring JSONL 记录（operationId/commandHash/before/after revision）
- 兼容：legacy 只读查询（search_ontology 等）在迁移完成前行为不变

---

## 🚫 范围外

- Desktop `ontology-data:*` 读路径迁 canonical（ONT.8 范围）
- `business-model.json` 与 `OntologyModel` 迁移（ONT.3 已交付）
- 本体图谱可视化（ONT.8/P2）
- 无 canonical 旧项目的自动迁移（AGENTS.md 明确禁止静默迁移）
