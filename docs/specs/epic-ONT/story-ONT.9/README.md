# Story Spec: ONT.9 - Agent 工具与遗留写入口的本体治理

**Epic:** ONT - Epic ONT
**Status:** 🟡 Planning
**Owner:** Architecture / Core
**Created:** 2026-10-12
**Last Updated:** 2026-10-12

---

## 📋 Story 概览

### User Story

作为 OriginOS 的使用者与架构维护者，
我想让所有仍在写入 legacy 本体文件（`data/projects/{projectId}/ontology/ontology.json`）的入口全部收敛到 canonical ontology（`data/ontology/{projectId}-ontology.json`）的唯一事实源，
以便消除双事实源、保证 Agent 产出的本体数据进入受治理的 canonical 图，并让历史残留数据不丢失。

### 背景与问题（2026-10-12 实况取证）

- 既有治理（Story ONT.3 / Proposal `replace-project-legacy-ontology-entrypoints`，已合并 `0.4.x`）完成了：新项目访谈建 canonical、项目入口读 canonical、Desktop ontology-data 写拒（`CANONICAL_EDIT_UNAVAILABLE`）、Web 本体/数据页签只读 canonical。
- **仍存在的双写入口（本次治理对象）：**
  1. **Agent 工具（结构层）**：`packages/core/src/lib/features/agent/tools/ontology-tools.ts` 的 `create_domain`（:160）、`create_concept`（:220）经 `ontologyOps`（legacy `ontology-data-store`）写 legacy 文件。supervisor scope 可用。
  2. **Agent 工具（实例层）**：`packages/core/src/lib/features/agent/tools/ontology-data-tools.ts` 的 `create_instance`（:143）、`update_instance`（:273）、`delete_instance`（:343）经 legacy `store` 写 legacy 文件与其 `data/` 子目录、版本目录、实例关系。
  3. **Web API 写路由（UI 消费已死）**：`packages/web/src/app/api/ontology-data/*`（domains/concepts/instances/relations/sync）仍直接读写 legacy 文件。全仓已无 UI 消费方（DataTabView/OntologyTabView 均走 canonical；仅 `OntologyConceptGraphEditor.getConceptSchema` 读，且该组件无渲染入口）。
  4. **Desktop IPC `ontology-data:*`**：写已拒；读仍走 legacy store（读取路径属 ONT.8 既有范围，本次不扩散）。
- **实发事故证据**：2026-10-12 19:50–19:51，行政办公项目（`proj-1791616381403-flcx7qded`，已有 canonical 13 概念）的 Supervisor 会话经 `create_concept`/`create_instance` 向 legacy 文件写入 4 概念（员工/请假单/考勤记录/部门，3 个与 canonical 重复）+ 1 实例（部门「行政部」），形成双事实源实锤。文件证据：`data/projects/proj-1791616381403-flcx7qded/ontology/ontology.json`（updatedAt 2026-10-12T11:55Z UTC）。
- **canonical authoring 能力缺口**：`CanonicalOntologyAuthoringCommand` 联合类型（`authoring-types.ts`）覆盖 domain/concept/property/relation/businessState/action/factType/rule/transition，**无 instance.* 命令**；而 `CanonicalOntology` 类型已含 `instances: CanonicalInstance[]`（`types.ts:289`）。

### 用户决策（2026-10-12，AskUserQuestion）

1. **治理范围：全量一次做完**——结构层工具迁 canonical authoring + 补 instance.* 命令后迁实例工具 + Web legacy 写路由改只读。
2. **存量数据：并入 canonical**——治理完成后把 legacy 里 canonical 缺失的概念/实例经 authoring 命令补进 canonical，legacy 文件原地保留作历史备份。

### 验收标准（简要）

- [ ] AC1: Agent 结构层工具（`create_domain`/`create_concept`）写入 canonical ontology（经 `CanonicalOntologyAuthoringService`），不再触碰 legacy 文件；写入后 Web 本体页签立即可见
- [ ] AC2: canonical authoring 支持 `instance.create`/`instance.update`/`instance.delete`（含 revision CAS、幂等、审计、validator 校验），Agent 实例工具迁至该命令集
- [ ] AC3: Web `/api/ontology-data/*` 的全部写操作（POST/PUT/DELETE/sync）返回结构化只读拒绝（`CANONICAL_EDIT_UNAVAILABLE` 或 405/410 语义），不再有 legacy 文件写入代码路径
- [ ] AC4: 已 canonical 项目的 legacy 残留数据并入 canonical（去重后经 authoring 命令补录，带 sourceRefs 标记来源），legacy 文件原地保留；行政办公项目验证 4 概念/1 实例并入后 canonical 完整
- [ ] AC5: 全仓生产源码不再出现「向 `data/projects/{projectId}/ontology/` 写入」的调用（`saveOntology`/`createInstance` 等 legacy 写函数仅剩只读消费者与测试引用）
- [ ] AC6: 既有 canonical 读写回归（ui/data-editor/workspace/interview/ontology feature 测试）零回归；legacy 只读路径（query/search/schema）行为不变

---

## 👥 团队

| 角色 | 姓名 | 职责 |
|------|------|------|
| Product Owner | Archersado | 需求定义和验收 |
| Tech Lead | Archersado | 架构设计 |
| Developer | Claude（subagent worktree 实施） | 开发实施 |
| QA | Claude（subagent worktree 实施） | 测试验证 |

---

## 📅 时间线

| 阶段 | 状态 |
|------|------|
| 需求分析 | ✅ 2026-10-12 完成 |
| 架构设计 | ✅ 2026-10-12 Proposal 定稿（govern-ontology-write-entrypoints） |
| 开发实施 | ✅ 2026-10-13 完成（T1-A/B/C/D/E） |
| 测试验证 | ✅ 2026-10-13 完成（AC1-AC6 通过，详见 testing.md 实施记录） |

---

## 🔗 相关链接

### 前序治理
- Story ONT.3（旧模型迁移）+ Proposal `replace-project-legacy-ontology-entrypoints`（已合并）：入口读 canonical、Desktop 写拒
- Proposal `add-canonical-ontology-authoring-actions`（已合并）：canonical authoring 命令集与 CAS/幂等/审计
- Proposal `integrate-ontology-cross-package-adapters`（ONT.8，In Progress）：跨包 adapter 门控

### 规约文档
- [AGENTS.md](../../../AGENTS.md)（本体构建系统架构 / 旧模型迁移约束 / Canonical Validator 与 Action Gate）

### Story 文档
- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)

---

## 📊 进度跟踪

### 当前状态

✅ **Done（2026-10-13）** - Proposal `govern-ontology-write-entrypoints` 实施与验证完成，待合并 `dev`

### 完成情况

- [x] 需求文档完成
- [x] 交互设计完成（只读拒绝提示，无新增交互面）
- [x] 架构设计完成
- [x] 开发实施完成（T1-A authoring instance.* / T1-B 结构层工具 / T1-C 实例层工具 / T1-D Web 只读化 / T1-E 残留并入）
- [x] 测试验证完成（AC1-AC6，见 testing.md 实施记录）
- [ ] 文档审查完成

### 阻塞问题

_当前无阻塞问题_

---

## 📝 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-10-12 | 初始化 Story Spec 并按双写入口盘点填写需求 | Claude |

---

## 📌 快速导航

- [⬆️ 返回 Epic 概览](../README.md)
- [📋 需求文档](./requirements.md)
- [🎨 交互设计](./interaction.md)
- [🏗️ 架构设计](./architecture.md)
- [💻 开发文档](./implementation.md)
- [🧪 测试文档](./testing.md)
