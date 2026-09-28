# Story 8.5 — 需求规格

**Epic:** 8 — 本体数据视图层
**状态:** 已实施
**优先级:** P1（多 Agent 协作场景强依赖）

---

## 用户故事

作为 Agent，我希望在创建实例时能够通过填写关系字段自动建立实例间的关联，并在查询实例时附带返回关系数据，以便多 Agent 协作场景下各 Worker 独立创建的实例（如品牌、产品、员工）不再是孤立数据节点，保持结构化价值。

---

## 背景与动机

Agent 通过 `ontologyDataTools` 创建实例，但实例之间没有关联。多 Agent 协作场景下各 Worker 独立创建的实例形成孤立数据节点，失去结构化价值。

本 Story 在**不增加新工具**的前提下，通过以下两个改动让关系管理透明化：

1. **`create_instance` 自动建立关系**：fields 中填写关系字段的目标实例 ID，工具内部自动调用关系 API
2. **`query_instances` 附带关系数据**：每个实例结果包含 `relations[]`，无需单独查询

---

## 验收标准

1. `get_concept_schema` 返回的 `fields` 中包含 `type="relation"` 的字段，对应本体中定义的 ConceptRelation
2. `create_instance` 的 `fields` 中填写 relation 字段的目标实例 ID，实例创建后关系自动写入 `instance-relations.json`
3. `query_instances` 返回的每个 item 包含 `relations` 数组
4. relation 字段值缺失时（未传），不影响实例创建，不产生错误关系记录
5. 违反基数约束时，`create_instance` 返回的 `relations` 中记录错误信息，实例本身仍成功创建

---

## 依赖关系

### 前置依赖

- Epic 7 本体数据服务层（已完成）
- 后端 API 已完整实现：
  - `GET /api/ontology-data/relations/instances?ontologyId=` — 列出全部实例关系
  - `POST /api/ontology-data/relations/instances?ontologyId=` — 创建实例关系（含基数约束验证）
  - `DELETE /api/ontology-data/relations/instances?ontologyId=` — 删除实例关系

### 被依赖

- Epic 8 其他 Story 的图谱视图（关系可视化渲染）

---

## 范围

### 在范围内

- Schema 自动注入关系字段
- `create_instance` 自动建立关系
- `query_instances` 附带关系数据

### 不在范围内

- 删除关系的工具（极少场景，可通过后续 Story 补充）
- 关系可视化渲染（属于 Epic 8 其他 Story 的图谱视图）
- 批量关系创建 API（工具内循环调用已足够）
