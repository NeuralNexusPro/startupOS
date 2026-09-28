# Story 8.5 — 测试策略

## 验收标准测试

| # | 验收标准 | 测试方法 |
|---|---------|---------|
| 1 | `get_concept_schema` 返回的 `fields` 中包含 `type="relation"` 的字段，对应本体中定义的 ConceptRelation | 单元测试：mock 含 relations 的 ontology，调用 `loadConceptSchema`，断言返回 fields 包含 relation 类型字段 |
| 2 | `create_instance` 的 `fields` 中填写 relation 字段的目标实例 ID，实例创建后关系自动写入 `instance-relations.json` | 集成测试：创建实例含 relation 字段，验证 `instance-relations.json` 中新增对应关系记录 |
| 3 | `query_instances` 返回的每个 item 包含 `relations` 数组 | 集成测试：预先创建实例和关系，查询后断言 items 中每条数据包含 `relations` 数组 |
| 4 | relation 字段值缺失时（未传），不影响实例创建，不产生错误关系记录 | 边界测试：创建实例不传 relation 字段，验证实例创建成功且 `relations` 为空数组 |
| 5 | 违反基数约束时，`create_instance` 返回的 `relations` 中记录错误信息，实例本身仍成功创建 | 边界测试：构造违反基数约束（如 1:1 关系重复创建）的调用，验证实例成功但 relations 含错误 |

---

## 测试用例详细设计

### TC-1: Schema 注入正向关系字段

**前置条件：** 本体中存在概念 A 和概念 B，且定义了 A → B 的关系 `belongs_to`

**步骤：**
1. 调用 `get_concept_schema(conceptA)`

**预期结果：**
- 返回的 `fields` 中包含 `{ name: "belongs_to__conceptB", type: "relation", relatedConceptId: "conceptB", relationType: "belongs_to" }`

### TC-2: Schema 注入反向关系字段

**前置条件：** 同上

**步骤：**
1. 调用 `get_concept_schema(conceptB)`

**预期结果：**
- 返回的 `fields` 中包含反向关系字段，`isReverse = true`

### TC-3: create_instance 自动建立关系

**前置条件：** 已创建目标实例 `inst-brand-001`

**步骤：**
1. 调用 `create_instance`，fields 中包含 `"belongs_to__concept-brand": "inst-brand-001"`

**预期结果：**
- 实例创建成功
- 返回值中 `relations` 数组包含一条 `belongs_to` 关系记录
- `instance-relations.json` 中新增对应条目

### TC-4: query_instances 附带关系数据

**前置条件：** 已创建实例和关系

**步骤：**
1. 调用 `query_instances`

**预期结果：**
- 返回的 `items` 中每条实例包含 `relations` 数组
- 关系数据包含 `type`、`sourceInstanceId`、`targetInstanceId` 等字段

### TC-5: relation 字段未传时正常创建

**步骤：**
1. 调用 `create_instance`，fields 中不包含任何 relation 字段

**预期结果：**
- 实例创建成功
- 返回值中 `relations` 为空数组
- 不产生错误关系记录

### TC-6: 违反基数约束

**前置条件：** 定义 1:1 关系，已存在一条关系记录

**步骤：**
1. 调用 `create_instance`，尝试为同一 source 实例再次创建同类型关系

**预期结果：**
- 实例创建成功（不受影响）
- `relations` 中对应条目包含错误信息
