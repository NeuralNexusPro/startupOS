# Story 8.5 — 架构设计

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

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/lib/features/ontology-data-store/types.ts` | 修改 | ConceptField 新增 relation 类型 |
| `src/lib/features/ontology-data-store/schema-validator.ts` | 修改 | loadConceptSchema 自动注入关系字段 |
| `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts` | 修改 | create_instance 和 query_instances 增强 |

---

## 后端 API（已完整实现，本 Story 不修改）

| API | 功能 |
|-----|------|
| `GET /api/ontology-data/relations/instances?ontologyId=` | 列出全部实例关系 |
| `POST /api/ontology-data/relations/instances?ontologyId=` | 创建实例关系（含基数约束验证） |
| `DELETE /api/ontology-data/relations/instances?ontologyId=` | 删除实例关系 |
