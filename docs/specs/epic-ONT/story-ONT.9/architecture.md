# 架构设计文档 - Story ONT.9

**Story:** Agent 工具与遗留写入口的本体治理
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 🏗️ 架构概览

### 设计目标

把「写 canonical ontology」收敛为唯一入口（`CanonicalOntologyAuthoringService` 命令通道），让 Agent 工具与 Web API 全部走它；legacy `ontology-data-store` 退化为只读兼容层；已 canonical 项目的 legacy 残留数据经同一命令通道并入。

### 数据流（治理后）

```
Agent 工具（create_domain/create_concept/create_instance/…）
  │  解析 ontologyRef（ontologyId → projectId/version/revision）
  ▼
CanonicalOntologyAuthoringService.execute(command)      ← 唯一写入通道
  ├─ permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION]
  ├─ expectedRevision CAS + operationId 幂等
  ├─ mutateOntology → canonical validator 全量校验
  └─ compareAndSwapAuthoring → data/ontology/{projectId}-ontology.json + authoring.jsonl

Web /api/ontology-data/*：写 → 结构化拒绝（CANONICAL_EDIT_UNAVAILABLE）
                          读 → 现状保留（ONT.8 迁移范围）

legacy data/projects/{id}/ontology/：只读（残留数据并入后成纯历史备份）
```

### AGENTS.md 规约符合性声明

- ✅ **旧模型迁移约束**：并入是调用方显式触发（脚本/手动），非读取/启动静默迁移；不覆盖 canonical，源文件保留
- ✅ **单一事实源**：全部写路径收敛 authoring 通道；legacy compatibility projection 仅读
- ✅ **依赖层级**：Agent 工具（Layer 2 features）→ ontology feature 公共 API（同层，经 index.ts 公共导出）；不新增跨层依赖
- ✅ **core exports 白名单**：新增 instance.* 命令类型经既有 `./lib/features/ontology` 门面导出，无新增深路径
- ✅ **禁止数据库**、性能约束（validator 全量校验 < 5s，行政办公 13 概念量级实测 < 100ms）

---

## 🧩 影响模块与改动面

| 模块 | 文件 | 改动 |
|------|------|------|
| core ontology | `authoring-types.ts` | 新增 `instance.create/update/delete` 命令联合成员 |
| core ontology | `authoring-service.ts` | `mutateOntology` 新增三个 case；交叉引用校验（conceptId 存在性） |
| core ontology | `validator.ts` | 如 instance 引用校验缺规则则补（只读纯函数） |
| core agent tools | `tools/ontology-tools.ts` | `create_domain`/`create_concept` 改走 authoring；移除 `ontologyOps` 写 import |
| core agent tools | `tools/ontology-data-tools.ts` | 实例写改走 instance.*；只读工具改读 canonical；移除 `store` 写 import |
| web api | `app/api/ontology-data/**/route.ts` | 写 handler 改结构化拒绝；删除 `fs.writeFile` 副作用 |
| web components | `components/os/data-editor/OntologyConceptGraphEditor.tsx` | 死代码确认后删除（唯一 legacy 读依赖） |
| scripts/oneoff | `scripts/ontology/merge-legacy-residue.mjs`（或 core 函数 + 临时调用） | FR5 并入脚本（显式执行，不入 CI） |

### 依赖方向（全部合法）

- `agent/tools → lib/features/ontology`（同包 feature 间经公共 index.ts）
- `web/app/api → @originos/core`（既有模式；本次只改响应不新增 core 依赖面）
- `scripts → core 公共 API`（一次性脚本，经包名说明符或直接 node 执行 core 编译产物）

---

## 📐 关键数据结构

### 新增 authoring 命令（authoring-types.ts）

```typescript
| { type: 'instance.create'; value: CanonicalInstance }
| { type: 'instance.update'; instanceId: string; patch: PlainPatch<CanonicalInstance> }
| { type: 'instance.delete'; instanceId: string }
```

- `instance.create` 校验：`value.conceptId` 必须命中当前 ontology `concepts[].id`；`value.id` 唯一；`data` 为 Record
- `instance.update` 校验：instanceId 存在；patch 不允许改 `conceptId`（结构性引用不可变，与 concept/domain 一致）
- `instance.delete` 校验：instanceId 存在；若有 CanonicalInstanceRelation 引用该实例则拒绝（引用完整性）

### Agent 工具 → authoring 适配层（ontology-tools.ts 内部）

```typescript
// ontologyId → projectId/version/revision 解析（复用 ProjectOntologyEntryService 或 canonical store 直读）
async function resolveAuthoringContext(ontologyId: string): Promise<{
  projectId: string; ontologyId: string; ontologyVersion: string; expectedRevision: number;
}>
// operationId: `tool-${toolCallId}`（每次工具调用唯一，天然幂等键）
// audit: { source: 'agent-tool', sourceId: toolCallId }
```

### legacy → canonical 字段映射（FR3/FR5）

| legacy | canonical | 说明 |
|--------|-----------|------|
| `fields` | `data` | 整体替换 |
| `meta.createdAt/updatedAt` | canonical 自维护 | 丢弃（sourceRefs 已溯源） |
| `meta.createdBy/version` | 丢弃 | canonical 无对应字段 |
| `conceptId` | `conceptId` | 直映 |
| `domainId`（空串常见） | 反查 concept.domainId | canonical instance 无 domainId 字段 |
| legacy 概念重复判定 | name + type 相同 | 并入时跳过 |
| `instance-relations.json` | CanonicalInstanceRelation 或 relation.* 命令 | 以 canonical types 现状为准，禁止第三种存储 |

---

## 🔒 安全与权限

- 工具侧权限：authoring 命令要求 `CANONICAL_ONTOLOGY_AUTHOR_PERMISSION`（既有常量），Agent 工具作为系统内组件直接携带；不引入新的用户授权面
- Web 拒绝响应：错误码 + 中文指引，无路径/堆栈泄漏
- 并入脚本：dry-run 输出将补录的条目清单，确认后执行；authoring 通道自带备份与审计

## ⚡ 性能考虑

- validator 全量校验 O(concepts+instances)，行政办公量级（13c/1i）可忽略；1000 实例量级 < 100ms 预期
- revision CAS 读-改-写为单文件原子写（CanonicalOntologyStore 既有），无新增锁

## 🔄 迁移/兼容策略

- 无 schema 变更（CanonicalInstance 既有）；authoring JSONL 追加新 commandType，旧记录不受影响
- legacy 只读查询在 ONT.8 完成前保持现状；本 Story 仅保证「不再新增 legacy 写」
- `ontology-data-store` 包不删除（仍服务只读与测试），仅收窄其写函数的消费面

## 🔙 回滚

- authoring 命令为新增联合成员，回滚 = 工具 revert 到 legacy 实现的 commit（单 commit revert）；canonical 数据不受损（append-only JSONL + CAS 快照）
- 并入脚本幂等，可重复执行修正遗漏
