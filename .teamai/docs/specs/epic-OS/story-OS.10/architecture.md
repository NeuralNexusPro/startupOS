# 架构设计 - Story OS.10

**Story:** 系统工具语义说明加固（Tool Schema Description Hardening）
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| TypeScript | 工具 schema 定义 | TypeBox 类型系统 |
| ToolRegistration | 工具注册接口 | 包含 description 和 parameters |
| successResult | 工具返回结构 | 统一返回格式 |

---

## 数据结构

### 工具 Schema 结构

```typescript
interface ToolRegistration<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: TSchema<TInput>;
  returns?: TSchema<TOutput>; // 当前未使用，预留
  execute: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
}
```

### 参数 Description 结构

```typescript
const StringParameter = Type.String({
  description: '参数说明文本',
  minLength: 1,
  // 其他约束...
});

const ObjectParameter = Type.Object({
  fieldName: Type.String({ description: '字段说明' }),
  // 其他字段...
}, { description: '对象参数整体说明' });
```

### 返回结构示例

```typescript
// query_ontology 返回
{
  success: true,
  ontologyId: string,
  ontology: {
    domains: Domain[],
    concepts: Concept[],
    relations: Relation[]
  }
}

// create_domain 返回
{
  success: true,
  domain: {
    id: string,
    name: string,
    description: string
  },
  ontologyId: string,
  message: string
}

// read_file 返回
{
  success: true,
  content: string,
  lineCount: number
}
```

---

## 模块设计

### 本体工具模块

**文件：** `src/lib/integrations/pi-agent/tools/ontology-tools.ts`

**工具列表：**
- `query_ontology` — 查询本体图谱
- `create_domain` — 创建领域层
- `create_concept` — 创建概念
- `search_ontology` — 搜索本体

**参数说明规约：**

```typescript
// ontologyId 统一说明
const ontologyIdParam = Type.String({
  description: '项目的本体 ID，形如 `ontology-{projectId}`。从 system prompt 的 projectContext 或【协作上下文】获取，**不要自己生成**。一个项目对应唯一一个 ontologyId。',
  minLength: 1
});

// domainId 统一说明
const domainIdParam = Type.String({
  description: '领域层 ID。如不确定可用值，**先调用 `query_ontology` 或 `list_concepts` 查看可用 domains**，不要凭名字猜测。',
  minLength: 1
});

// conceptId 统一说明
const conceptIdParam = Type.String({
  description: '概念 ID。从 `list_concepts` 的返回中获取，不要自己生成。',
  minLength: 1
});

// instanceId 统一说明
const instanceIdParam = Type.String({
  description: '实例 ID。从 `query_instances` 的返回中获取，不要自己生成。',
  minLength: 1
});
```

### 本体数据工具模块

**文件：** `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts`

**工具列表：**
- `create_instance` — 创建实例
- `get_instance` — 获取实例
- `update_instance` — 更新实例
- `delete_instance` — 删除实例
- `query_instances` — 查询实例
- `get_concept_schema` — 获取概念 schema
- `list_concepts` — 列出概念

**参数说明规约：**

```typescript
// fields 参数说明
const fieldsParam = Type.Object({
  // 动态字段
}, {
  description: '实例字段对象。结构由 concept 定义决定，可先调用 `get_concept_schema` 查询字段约束。'
});

// conceptType 枚举说明
const conceptTypeParam = Type.Union([
  Type.Literal('entity'),
  Type.Literal('process'),
  Type.Literal('attribute'),
  Type.Literal('relation')
], {
  description: '概念类型：`entity`（实体）/ `process`（流程）/ `attribute`（属性）/ `relation`（关系）。'
});
```

### 文件工具模块

**文件：** `src/lib/integrations/pi-agent/tools/file-tools.ts`

**工具列表：**
- `read_file` — 读取文件
- `write_file` — 写入文件
- `edit_file` — 编辑文件
- `delete_file` — 删除文件
- `list_files` — 列出文件

**参数说明规约：**

```typescript
// filePath 统一说明
const filePathParam = Type.String({
  description: '文件路径。**默认相对于工作目录**（system prompt 中告知），也支持绝对路径。**不要拼接 `data/projects/...`**——工作目录已经是项目内目录。',
  minLength: 1
});

// content 说明
const contentParam = Type.String({
  description: '文件内容。写入时完整覆盖原文件。'
});

// oldString 说明
const oldStringParam = Type.String({
  description: '要被替换的原始字符串。必须是文件内**唯一存在**的子串，否则需要设置 replaceAll=true。'
});

// newString 说明
const newStringParam = Type.String({
  description: '替换后的新字符串。'
});

// replaceAll 说明
const replaceAllParam = Type.Boolean({
  description: '是否替换所有匹配项。默认为 false（只替换第一个）。'
});
```

### 工具级 Description 模板

**返回结构说明模板：**

```typescript
const toolDescription = `
工具功能描述。

返回 JSON：{ success: boolean, ...业务字段 }；失败时 { success: false, error: string }。

具体返回字段：
- success: 操作是否成功
- [业务字段]: 具体说明
`;
```

**示例：query_ontology**

```typescript
const queryOntologyDescription = `
查询项目的本体图谱，返回所有领域、概念和关系。

返回 JSON：{ success: boolean, ontologyId: string, ontology: { domains: Domain[], concepts: Concept[], relations: Relation[] } }；失败时 { success: false, error: string }。

具体返回字段：
- success: 操作是否成功
- ontologyId: 本体 ID
- ontology: 本体图谱对象
  - domains: 领域列表
  - concepts: 概念列表
  - relations: 关系列表
`;
```

### 易错点防御性提示

**edit_file 工具：**

```typescript
const editFileDescription = `
编辑文件，替换指定字符串。

**注意：** oldString 必须是文件内**唯一存在**的子串，否则需要设置 replaceAll=true。

返回 JSON：{ success: boolean, message: string }；失败时 { success: false, error: string }。
`;
```

**write_file 工具：**

```typescript
const writeFileDescription = `
写入文件，**完整覆盖**原文件。如需追加内容，请使用 read_file + write_file 模式。

返回 JSON：{ success: boolean, message: string }；失败时 { success: false, error: string }。
`;
```

**delete_file 工具：**

```typescript
const deleteFileDescription = `
删除文件或目录。**注意：** 目录会**递归删除**，慎用。

返回 JSON：{ success: boolean, message: string }；失败时 { success: false, error: string }。
`;
```

**execute_command 工具：**

```typescript
const executeCommandDescription = `
执行 shell 命令。默认超时 30000ms，长任务请显式传 timeout 参数。

返回 JSON：{ success: boolean, stdout: string, stderr: string, exitCode: number }；失败时 { success: false, error: string }。
`;
```

**Skill 工具：**

```typescript
const skillDescription = `
调用技能。调用后会收到技能完整指令，**不要嵌套调用其他工具**直到收到指令。

返回 JSON：{ success: boolean, instructions: string }；失败时 { success: false, error: string }。
`;
```

---

## 代码变更

### 修改文件

| 文件路径 | 说明 |
|---------|------|
| `src/lib/integrations/pi-agent/tools/ontology-tools.ts` | 4 个工具 / ~12 个参数补 description + 工具级返回结构 |
| `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts` | 7 个工具 / ~28 个参数补 description + 工具级返回结构 |
| `src/lib/integrations/pi-agent/tools/file-tools.ts` | 5 个工具 / 4 个核心参数补 description + 易错防御性提示 |
| `src/lib/integrations/pi-agent/tools/bash-tools.ts` | 工具级 description 末尾加返回结构 |
| `src/lib/integrations/pi-agent/tools/coding-tools.ts` | 同上 |
| `src/lib/integrations/pi-agent/tools/document-tools.ts` | 同上 |
| `src/lib/integrations/pi-agent/tools/skill-tools.ts` | 同上 + Skill 防御性提示 |
| `src/lib/integrations/pi-agent/tools/system-tools.ts` | 同上 |
| `src/lib/integrations/pi-agent/tools/url-tools.ts` | 同上 |
| `src/lib/integrations/pi-agent/tools/ask-user-question-tools.ts` | 同上 |

---

## 阶段化交付

| PR | 范围 | 价值 |
|----|------|------|
| **PR-A**（必须）| OS10-01（本体）+ OS10-02（文件） | 直接消除"自造 ontologyId / domainId"问题，立即受益于 Story 9.29 / 9.30 实证 |
| **PR-B**（建议）| OS10-03（返回结构）+ OS10-04（易错防御） | 全量收敛，长链工具调用不再误解返回结构 |

---

## 相关文档

- [需求规格](./requirements.md)
- [测试策略](./testing.md)
- [Story OS.10 README](./README.md)
- [AGENTS.md 架构规约](../../../AGENTS.md)
