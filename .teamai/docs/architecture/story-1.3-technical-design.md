# Story 1.3 技术设计文档 - 本体结构生成方案

**Story ID**: ARC-187
**版本**: 1.0
**设计者**: System Architect
**日期**: 2026-03-23
**状态**: 待审核

---

## 📋 设计目标

为 Story 1.3 设计完整的技术方案，实现从访谈结果到本体结构的自动生成，包括：

1. **本体数据结构设计** - 三层架构（Domain/Concept/Instance）
2. **生成算法设计** - 访谈答案到本体的映射逻辑
3. **UI 交互方案** - 预览、编辑、确认流程
4. **性能优化** - 确保生成时间 < 5 秒

---

## 🏗️ 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Story 1.3 系统架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │ Interview    │─────▶│  Ontology    │─────▶│ Storage  │ │
│  │ Session      │      │  Generator   │      │ Layer    │ │
│  │ (Story 1.2)  │      │              │      │          │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                      │                    │      │
│         │                      │                    │      │
│         ▼                      ▼                    ▼      │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │ Answer       │      │  Ontology    │      │ JSON     │ │
│  │ Parser       │      │  Validator   │      │ Files    │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                      │                           │
│         │                      │                           │
│         ▼                      ▼                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              UI Preview & Edit Layer                 │ │
│  │  - Tree View Component                               │ │
│  │  - Edit Operations                                   │ │
│  │  - Graph Visualization                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 数据流图

```
访谈完成 (Story 1.2)
    │
    ▼
读取访谈答案 (InterviewSession)
    │
    ▼
解析答案 (AnswerParser)
    │
    ├─▶ 提取工作领域 → 生成 Domain
    ├─▶ 提取主要任务 → 生成 Concept (task)
    ├─▶ 提取使用工具 → 生成 Concept (tool)
    └─▶ 提取目标     → 生成 Concept (goal)
    │
    ▼
生成关系 (RelationGenerator)
    │
    ├─▶ Domain contains Concepts
    └─▶ Concepts 之间的依赖关系
    │
    ▼
验证本体结构 (OntologyValidator)
    │
    ├─▶ 检查必需字段
    ├─▶ 验证关系完整性
    └─▶ 确保最小结构（1 Domain + 2+ Concepts）
    │
    ▼
保存到存储 (JSON Store)
    │
    ▼
返回生成结果 + 显示 UI
```

---

## 📊 数据结构设计

### 1. 本体三层结构

基于现有的 `src/types/ontology.ts`，采用三层架构：

#### Layer 1: Domain（领域层）

```typescript
interface Domain {
  id: string;              // UUID
  name: string;            // 领域名称，如"软件开发"
  description: string;     // 领域描述
  icon?: string;           // 图标 emoji
  color?: string;          // 主题色
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

**生成规则**：
- 从 `work_domain` 答案提取领域名称
- 结合 `work_mode` 生成描述
- 默认图标：🔷，默认颜色：#3b82f6

#### Layer 2: Concept（概念层）

```typescript
interface Concept {
  id: string;              // UUID
  domainId: string;        // 所属 Domain ID
  name: string;            // 概念名称
  type: string;            // 概念类型：task/tool/goal/routine/management
  attributes: Record<string, any>;  // 属性键值对
  description?: string;    // 概念描述
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

**生成规则**：
- `main_tasks` → type: 'task'，解析任务列表（最多 5 个）
- `tools_used` → type: 'tool'，每个工具生成一个 Concept
- `goals` → type: 'goal'，解析目标列表（最多 3 个）
- 如果 Concepts < 2，补充默认 Concepts（日常工作、项目管理）

#### Layer 3: Instance（实例层）

```typescript
interface Instance {
  id: string;              // UUID
  conceptId: string;       // 所属 Concept ID
  data: Record<string, any>;  // 实例数据
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

**MVP 阶段**：不自动生成 Instances，预留接口供后续扩展。

#### Relations（关系）

```typescript
interface Relation {
  id: string;              // UUID
  sourceId: string;        // 源实体 ID
  targetId: string;        // 目标实体 ID
  type: RelationType;      // 关系类型
  metadata?: Record<string, any>;
  createdAt: string;       // ISO 8601
}

type RelationType = 'dependency' | 'contains' | 'association' | 'inheritance';
```

**生成规则**：
- Domain → Concepts: 'contains' 关系
- Task Concepts 之间: 'dependency' 关系（顺序依赖）

---

## 🔧 核心算法设计

### 1. 答案解析器 (AnswerParser)

**职责**：从访谈答案中提取结构化信息

```typescript
class AnswerParser {
  // 提取工作领域
  extractWorkDomain(answers: Record<string, QuestionAnswer>): string {
    return this.getAnswer(answers, 'work_domain') || 'My Project';
  }

  // 解析任务列表
  parseTasks(taskText: string): TaskItem[] {
    // 按换行符、逗号、分号分割
    const lines = taskText.split(/[\n,;，；]/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    return lines.slice(0, 5).map((line, index) => ({
      name: line.substring(0, 30),
      priority: index === 0 ? 'high' : 'medium',
      category: 'general',
      description: line
    }));
  }

  // 解析目标列表
  parseGoals(goalText: string): GoalItem[] {
    const lines = goalText.split(/[\n,;，；]/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    return lines.slice(0, 3).map(line => ({
      name: line.substring(0, 20),
      description: line
    }));
  }
}
```

**性能考虑**：
- 简单字符串分割，时间复杂度 O(n)
- 限制解析数量（任务 5 个，目标 3 个）
- 预计耗时：< 10ms

### 2. 本体生成器 (OntologyGenerator)

**职责**：根据解析结果生成完整本体结构

```typescript
class OntologyGenerator {
  async generateFromInterview(
    interview: InterviewSession
  ): Promise<OntologyGenerationResult> {
    const startTime = Date.now();

    // Step 1: 解析答案
    const workDomain = this.extractWorkDomain(interview.answers);
    const workMode = this.extractWorkMode(interview.answers);
    const tasks = this.parseTasks(interview.answers);
    const tools = this.parseTools(interview.answers);
    const goals = this.parseGoals(interview.answers);

    // Step 2: 生成 Domain
    const domain = this.createDomain(workDomain, workMode);

    // Step 3: 生成 Concepts
    const concepts = [
      ...this.createTaskConcepts(domain.id, tasks),
      ...this.createToolConcepts(domain.id, tools),
      ...this.createGoalConcepts(domain.id, goals)
    ];

    // Step 4: 确保最小结构
    this.ensureMinimumConcepts(domain.id, concepts);

    // Step 5: 生成关系
    const relations = this.generateRelations(domain, concepts);

    // Step 6: 构建本体
    const ontology: Ontology = {
      id: uuidv4(),
      projectId: interview.projectId,
      name: `${workDomain} Ontology`,
      domains: [domain],
      concepts,
      instances: [],
      relations,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Step 7: 验证
    this.validateOntology(ontology);

    // Step 8: 保存
    await this.saveOntology(ontology);

    const generationTime = Date.now() - startTime;

    return {
      ontology,
      generationTime,
      source: 'interview'
    };
  }
}
```

**性能目标**：
- 总耗时 < 5 秒（AC 要求）
- 各步骤预估：
  - 解析答案：< 50ms
  - 生成结构：< 100ms
  - 验证：< 50ms
  - 保存到文件：< 200ms
  - **总计：< 400ms**（远低于 5 秒要求）

### 3. 关系生成算法

```typescript
generateRelations(domain: Domain, concepts: Concept[]): Relation[] {
  const relations: Relation[] = [];

  // 1. Domain contains all Concepts
  concepts.forEach(concept => {
    relations.push({
      id: uuidv4(),
      sourceId: domain.id,
      targetId: concept.id,
      type: 'contains',
      createdAt: new Date().toISOString()
    });
  });

  // 2. Task dependencies (sequential)
  const taskConcepts = concepts.filter(c => c.type === 'task');
  for (let i = 0; i < taskConcepts.length - 1; i++) {
    relations.push({
      id: uuidv4(),
      sourceId: taskConcepts[i].id,
      targetId: taskConcepts[i + 1].id,
      type: 'dependency',
      createdAt: new Date().toISOString()
    });
  }

  return relations;
}
```

---

## 💾 存储方案

### 文件结构

```
data/
├── projects/
│   └── {project-id}/
│       └── ontology.json          # 项目本体
└── interviews/
    └── {session-id}.json          # 访谈会话（含本体 ID）
```

### 本体文件格式

```json
{
  "version": "1.0.0",
  "createdAt": "2026-03-23T02:00:00.000Z",
  "updatedAt": "2026-03-23T02:00:00.000Z",
  "data": {
    "id": "ont-uuid",
    "projectId": "proj-uuid",
    "name": "软件开发 Ontology",
    "domains": [...],
    "concepts": [...],
    "instances": [],
    "relations": [...],
    "version": "1.0.0",
    "createdAt": "2026-03-23T02:00:00.000Z",
    "updatedAt": "2026-03-23T02:00:00.000Z"
  }
}
```

### 存储服务接口

```typescript
interface OntologyStorage {
  // 保存本体
  save(ontology: Ontology): Promise<void>;

  // 读取本体
  getById(ontologyId: string): Promise<Ontology | null>;

  // 通过项目 ID 获取本体
  getByProjectId(projectId: string): Promise<Ontology | null>;

  // 更新本体
  update(ontology: Ontology): Promise<void>;
}
```

**实现**：使用现有的 `jsonStore` 服务（`src/lib/storage/json-store.ts`）

---

## 🎨 UI 组件设计

### 1. 本体预览组件 (OntologyPreview)

**位置**：`src/components/ontology/OntologyPreview.tsx`

**Props**：
```typescript
interface OntologyPreviewProps {
  ontology: Ontology;
  onEdit: () => void;
  onConfirm: () => void;
}
```

**功能**：
- 树形结构展示（Domain → Concepts）
- 展开/折叠交互
- 显示属性摘要
- 两个操作按钮：编辑本体、确认并创建

### 2. 本体编辑组件 (OntologyEditor)

**位置**：`src/components/ontology/OntologyEditor.tsx`

**Props**：
```typescript
interface OntologyEditorProps {
  ontology: Ontology;
  onSave: (operations: OntologyEditOperation[]) => Promise<void>;
  onCancel: () => void;
}
```

**功能**：
- 节点重命名（双击或点击编辑图标）
- 节点删除（带确认对话框）
- 添加子概念
- 属性编辑（添加/删除属性）
- 操作缓存（批量提交）

### 3. 树形结构组件 (OntologyTree)

**位置**：`src/components/ontology/OntologyTree.tsx`

**特性**：
- 递归渲染（Domain → Concepts）
- 图标区分（📂 Domain, 📄 Concept）
- 颜色编码（Domain 青色，Concept 白色）
- 键盘导航支持
- 无障碍 ARIA 标签

---

## 🔌 API 设计

### 1. 生成本体 API

**Endpoint**: `POST /api/ontology/generate`

**Request**:
```typescript
{
  interviewId: string;  // 访谈会话 ID
}
```

**Response**:
```typescript
{
  success: boolean;
  ontology: Ontology;
  generationTime: number;  // 毫秒
}
```

**实现位置**: `src/app/api/ontology/generate/route.ts`

### 2. 获取本体 API

**Endpoint**: `GET /api/ontology/[id]`

**Response**:
```typescript
{
  success: boolean;
  ontology: Ontology;
}
```

### 3. 编辑本体 API

**Endpoint**: `PATCH /api/ontology/[id]`

**Request**:
```typescript
{
  operations: OntologyEditOperation[];
}
```

**Response**:
```typescript
{
  success: boolean;
  ontology: Ontology;
  errors?: string[];
}
```

---

## ⚡ 性能优化方案

### 1. 生成性能优化

**目标**: < 5 秒（实际预计 < 500ms）

**优化措施**：
- 限制解析数量（任务 5 个，工具不限，目标 3 个）
- 使用同步操作（避免不必要的异步）
- 批量生成 UUID（一次生成所有需要的 ID）
- 延迟验证（仅在保存前验证）

### 2. UI 渲染优化

**措施**：
- 虚拟滚动（如果节点 > 50）
- 懒加载子节点
- 使用 React.memo 避免重复渲染
- 节流/防抖用户输入

### 3. 存储优化

**措施**：
- 异步写入文件
- 使用 JSON.stringify 缓存
- 避免频繁读写（编辑时仅内存操作）

---

## 🧪 测试策略

### 1. 单元测试

**测试文件**: `src/lib/ontology/__tests__/ontology-builder.test.ts`

**测试用例**：
- ✅ 从访谈生成本体（正常流程）
- ✅ 解析任务列表（多种分隔符）
- ✅ 解析目标列表
- ✅ 生成最小结构（< 2 concepts 时补充）
- ✅ 生成关系（contains + dependency）
- ✅ 验证本体结构

### 2. 集成测试

**测试文件**: `src/app/api/ontology/__tests__/generate.test.ts`

**测试用例**：
- ✅ API 端到端生成
- ✅ 保存到文件系统
- ✅ 读取已保存的本体
- ✅ 编辑操作（add/update/delete）

### 3. 性能测试

**测试目标**：
- 生成时间 < 5 秒（实际 < 500ms）
- 内存占用 < 50MB
- 文件大小 < 100KB

---

## 🔒 错误处理

### 1. 生成阶段错误

| 错误类型 | 处理方式 |
|---------|---------|
| 访谈未完成 | 返回 400 错误，提示完成访谈 |
| 答案为空 | 使用默认值生成最小本体 |
| 解析失败 | 记录日志，使用默认结构 |
| 保存失败 | 返回 500 错误，保留内存中的本体 |

### 2. 编辑阶段错误

| 错误类型 | 处理方式 |
|---------|---------|
| 本体不存在 | 返回 404 错误 |
| 删除不存在的节点 | 返回错误信息，不中断其他操作 |
| 关系引用无效 | 自动清理无效关系 |
| 并发编辑冲突 | 使用 updatedAt 时间戳检测，提示用户刷新 |

---

## 📐 验证规则

### 本体结构验证

```typescript
class OntologyValidator {
  validate(ontology: Ontology): ValidationResult {
    const errors: string[] = [];

    // 1. 必须有至少 1 个 Domain
    if (ontology.domains.length === 0) {
      errors.push('至少需要 1 个 Domain');
    }

    // 2. 必须有至少 2 个 Concepts
    if (ontology.concepts.length < 2) {
      errors.push('至少需要 2 个 Concepts');
    }

    // 3. 所有 Concepts 必须属于有效的 Domain
    const domainIds = new Set(ontology.domains.map(d => d.id));
    ontology.concepts.forEach(c => {
      if (!domainIds.has(c.domainId)) {
        errors.push(`Concept ${c.id} 引用了无效的 Domain`);
      }
    });

    // 4. 所有 Relations 必须引用有效的实体
    const entityIds = new Set([
      ...ontology.domains.map(d => d.id),
      ...ontology.concepts.map(c => c.id),
      ...ontology.instances.map(i => i.id)
    ]);

    ontology.relations.forEach(r => {
      if (!entityIds.has(r.sourceId)) {
        errors.push(`Relation ${r.id} 引用了无效的 source`);
      }
      if (!entityIds.has(r.targetId)) {
        errors.push(`Relation ${r.id} 引用了无效的 target`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

---

## 🎯 实现优先级

### Phase 1: 核心生成功能（P0）

- [x] 本体数据结构定义（已完成）
- [ ] 答案解析器实现
- [ ] 本体生成器实现
- [ ] 关系生成算法
- [ ] 存储服务集成
- [ ] 生成 API 实现

### Phase 2: UI 预览与编辑（P0）

- [ ] OntologyPreview 组件
- [ ] OntologyTree 组件
- [ ] 基础编辑功能（重命名、删除）
- [ ] 编辑 API 实现

### Phase 3: 高级功能（P1）

- [ ] 添加子概念功能
- [ ] 属性编辑功能
- [ ] 本体图谱可视化
- [ ] 撤销/重做功能

---

## 📋 验收标准检查

| AC | 描述 | 实现方案 | 状态 |
|----|------|---------|------|
| AC1 | 根据访谈答案生成初始本体结构 | OntologyGenerator.generateFromInterview() | ✅ 设计完成 |
| AC2 | 本体包含实体、属性、关系定义 | Domain/Concept/Relation 三层结构 | ✅ 设计完成 |
| AC3 | 支持本体结构的可视化展示 | OntologyTree 树形组件 | ✅ 设计完成 |
| AC4 | 支持用户对本体进行编辑和调整 | OntologyEditor + 编辑 API | ✅ 设计完成 |
| AC5 | 导出本体结构为标准格式 | JSON 格式存储 | ✅ 设计完成 |
| 性能 | 生成时间 < 5 秒 | 预计 < 500ms | ✅ 设计完成 |

---

## 🔄 与其他 Story 的集成

### Story 1.2 集成

**输入**：`InterviewSession` 对象
- 从 Story 1.2 的加载完成事件触发
- 读取 `data/interviews/{session-id}.json`

### Story 1.4 集成（未来）

**输出**：`Ontology` 对象
- 保存到 `data/projects/{project-id}/ontology.json`
- 提供 API 供后续 Story 使用

---

## 📝 技术债务与改进方向

### 当前限制

1. **简单解析**：使用字符串分割，未使用 NLP
2. **固定关系**：仅支持 contains 和 dependency
3. **无 AI 辅助**：未集成 LLM 优化生成

### 未来改进

1. **智能解析**：集成 LLM 理解用户意图
2. **关系推断**：自动发现 Concepts 之间的关系
3. **本体推荐**：基于领域知识库推荐标准本体
4. **协作编辑**：支持多人同时编辑本体

---

## 📚 参考文档

- [Story 1.3 交互设计](../../docs/stories/epic-1/story-1-3-interaction.md)
- [Story 1.3 测试用例](../../docs/test-cases/epic-1-project-quick-launch/test-cases-1.3-ontology-generation.md)
- [本体类型定义](../../src/types/ontology.ts)
- [本体构建服务](../../src/lib/ontology/ontology-builder.ts)
- [AI 本体理论](../../docs/cognitive/ai-ontology.md)

---

## ✅ 审核清单

- [x] 数据结构设计完整
- [x] 算法设计清晰
- [x] 性能目标明确（< 5 秒）
- [x] API 接口定义完整
- [x] UI 组件设计清晰
- [x] 错误处理方案完善
- [x] 测试策略明确
- [x] 验收标准覆盖
- [x] 与其他 Story 集成方案清晰

---

## 📅 时间估算

| 任务 | 预估时间 | 负责人 |
|------|---------|--------|
| 核心生成逻辑 | 4 小时 | Developer |
| API 实现 | 2 小时 | Developer |
| UI 组件开发 | 6 小时 | Developer |
| 单元测试 | 3 小时 | Developer |
| 集成测试 | 2 小时 | QA Engineer |
| E2E 测试 | 2 小时 | QA Engineer |
| **总计** | **19 小时** | |

---

**设计完成日期**: 2026-03-23
**下一步**: 提交给 PM 和 Developer 审核
