# Story 8.5 — 本体实例关系集成

**Epic:** 8 — 本体数据视图层
**状态:** 已实施
**创建:** 2026-05-26
**优先级:** P1（多 Agent 协作场景强依赖）

---

## 背景与动机

Agent 通过 `ontologyDataTools` 创建实例，但实例之间没有关联。多 Agent 协作场景下各 Worker 独立创建的实例（如品牌、产品、员工）形成孤立数据节点，失去结构化价值。

本 Story 在**不增加新工具**的前提下，通过以下两个改动让关系管理透明化：

1. **`create_instance` 自动建立关系**：fields 中填写关系字段的目标实例 ID，工具内部自动调用关系 API
2. **`query_instances` 附带关系数据**：每个实例结果包含 `relations[]`，无需单独查询

---

## 数据模型

### ConceptField 新增 relation 类型

```typescript
// src/lib/features/ontology-data-store/types.ts
interface ConceptField {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "array" | "object" | "relation";  // 新增 relation
  required: boolean;
  // relation 类型专用字段：
  relatedConceptId?: string;     // 关联概念 ID
  relatedConceptName?: string;   // 关联概念名称（展示用）
  relationType?: string;         // 关系类型，如 belongs_to
  cardinality?: "1:1" | "1:N" | "N:1" | "N:M";
  isReverse?: boolean;           // true = 本概念为 target 侧
}
```

### InstanceRelation（已有）

```typescript
// src/lib/features/ontology-data-store/relation-validator.ts
interface InstanceRelation {
  id: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  type: string;
  sourceConceptId: string;
  targetConceptId: string;
}
```

---

## 实现细节

### 1. Schema 自动注入关系字段

**文件：** `src/lib/features/ontology-data-store/schema-validator.ts`

`loadConceptSchema()` 在读取概念 `attributes` 之后，遍历本体中的 `relations` 数组：
- 本概念为 `sourceId` → 注入正向 relation 字段，`name = "{type}__{targetConceptId}"`
- 本概念为 `targetId` → 注入反向 relation 字段，`name = "{type}__{sourceConceptId}__reverse"`，`isReverse = true`

Agent 调用 `get_concept_schema` 即可看到所有关系字段，无需额外探索。

### 2. `create_instance` 自动建立关系

**文件：** `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts`

Agent 在 `fields` 中填写 relation 字段的值（目标实例 ID）时，工具内部：
1. 先 `loadConceptSchema` 识别 relation 字段
2. 将 relation 字段从 `fields` 中剥离，只把普通字段写入实例
3. 实例创建完成后，对每个 relation 字段的每个目标 ID 调用 `POST /api/ontology-data/relations/instances`
4. 返回 `{ instance, relations: InstanceRelation[] }`

**示例 Agent 调用：**

```json
{
  "tool": "create_instance",
  "params": {
    "ontologyId": "ontology-proj-xxx",
    "domainId": "domain-products",
    "conceptId": "concept-product",
    "fields": {
      "name": "iPhone 16",
      "price": 5999,
      "belongs_to__concept-brand": "inst-apple-brand-001"
    }
  }
}
```

`belongs_to__concept-brand` 是由 `get_concept_schema` 返回的 relation 字段名，值为目标实例 ID。工具自动建立 `prod-xxx --[belongs_to]--> inst-apple-brand-001` 关系。

### 3. `query_instances` 附带关系

**文件：** `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts`

查询时一次性加载本体全部 `InstanceRelation`，按 `sourceInstanceId` / `targetInstanceId` 过滤后附加到每个 item：

```json
{
  "items": [
    {
      "id": "inst-prod-001",
      "fields": { "name": "iPhone 16", "price": 5999 },
      "relations": [
        { "type": "belongs_to", "sourceInstanceId": "inst-prod-001", "targetInstanceId": "inst-apple-brand-001", ... }
      ]
    }
  ]
}
```

Agent 通过 `relations` 字段即可了解实例的关联上下文，无需额外调用关系查询工具。

---

## Agent 使用流程

```
1. list_concepts(ontologyId)
   → 获取 conceptId 列表

2. get_concept_schema(conceptId)
   → 返回字段包括 type="relation" 的字段
   → 例：{ name: "belongs_to__concept-brand", type: "relation", relatedConceptId: "concept-brand", ... }

3. 先创建目标实例（如品牌）
   → create_instance(brand fields) → { instance: { id: "inst-brand-001" } }

4. 创建源实例时直接填关系字段
   → create_instance({ ..., "belongs_to__concept-brand": "inst-brand-001" })
   → 自动建立关系，返回 { instance, relations: [{ id, type, ... }] }

5. 查询时自动得到关系上下文
   → query_instances → items[].relations[]
```

---

## 后端 API（已完整实现，本 Story 不修改）

| API | 功能 |
|-----|------|
| `GET /api/ontology-data/relations/instances?ontologyId=` | 列出全部实例关系 |
| `POST /api/ontology-data/relations/instances?ontologyId=` | 创建实例关系（含基数约束验证） |
| `DELETE /api/ontology-data/relations/instances?ontologyId=` | 删除实例关系 |

---

## 不在范围内

- 删除关系的工具（极少场景，可通过后续 Story 补充）
- 关系可视化渲染（属于 Epic 8 其他 Story 的图谱视图）
- 批量关系创建 API（工具内循环调用已足够）

---

## 验收条件

1. `get_concept_schema` 返回的 `fields` 中包含 `type="relation"` 的字段，对应本体中定义的 ConceptRelation
2. `create_instance` 的 `fields` 中填写 relation 字段的目标实例 ID，实例创建后关系自动写入 `instance-relations.json`
3. `query_instances` 返回的每个 item 包含 `relations` 数组
4. relation 字段值缺失时（未传），不影响实例创建，不产生错误关系记录
5. 违反基数约束时，`create_instance` 返回的 `relations` 中记录错误信息，实例本身仍成功创建
