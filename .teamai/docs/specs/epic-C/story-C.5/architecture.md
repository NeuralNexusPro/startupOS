# Story C.5: 项目创建访谈 - 架构设计文档

**Story 编号:** C.5
**版本:** 1.0.0
**日期:** 2026-03-12
**架构师:** System Architect
**状态:** Draft

---

## 1. 架构概述

### 1.1 系统目标

设计项目创建访谈系统，实现：
1. **隐形采集** - 用户感知仅"项目创建"，后台提取 Project TASTE + 构建 Ontology
2. **复用 C.1 基础设施** - 复用 TASTEProfile、LLM 调用模式、存储模式
3. **两层 TASTE 融合** - 项目创建后自动融合 User TASTE + Project TASTE

### 1.2 架构原则

| 原则 | 实施策略 |
|-----|---------|
| **隐形采集** | API 不暴露 TASTE 概念，所有提取后台完成 |
| **复用优先** | 复用 C.1 的 TASTEProfile、服务模式、存储模式 |
| **关注点分离** | 访谈流程 vs TASTE 提取 vs Ontology 构建 |
| **渐进式** | 支持跳过步骤、稍后补充 |

### 1.3 技术栈

| 技术 | 版本 | 用途 |
|-----|------|------|
| Next.js | 14+ | API Routes |
| TypeScript | 5+ | 类型安全 |
| Zod | 3+ | Schema 验证 |
| 文件 JSON | - | 存储（MVP）|

---

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend Layer                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ProjectCreationWizard                                            │  │
│  │  ├── StepBackground (Step 1)                                      │  │
│  │  ├── StepPriorities (Step 2)                                      │  │
│  │  ├── StepWorkMode (Step 3)                                        │  │
│  │  └── StepConfirm (Step 4)                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API Layer                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  POST /api/project/create/start           → 开始访谈             │  │
│  │  POST /api/project/create/:sessionId/question → 提问             │  │
│  │  POST /api/project/create/:sessionId/answer   → 回答             │  │
│  │  POST /api/project/create/:sessionId/complete  → 完成访谈        │  │
│  │  GET  /api/project/create/:sessionId/status    → 状态查询        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Service Layer                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ProjectCreationService                                           │  │
│  │  ├── 管理访谈会话状态                                              │  │
│  │  ├── 协调问题流程                                                  │  │
│  │  └── 触发后台处理                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────┐  ┌────────────────────────────────────┐│
│  │  TasteExtractionService    │  │  OntologyBuilderService           ││
│  │  (复用 C.1 模式)            │  │  (新服务)                          ││
│  │  ├── extractFromBackground │  │  ├── buildFromBackground          ││
│  │  ├── extractFromPriorities │  │  ├── extractDomains               ││
│  │  └── extractFromWorkMode   │  │  └── generateOntology             ││
│  └────────────────────────────┘  └────────────────────────────────────┘│
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  TASTEMergeService (复用 C.1)                                     │  │
│  │  ├── mergeUserAndProjectTASTE()                                  │  │
│  │  └── conflictDetection()                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Storage Layer                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  data/                                                             │  │
│  │  ├── projects/                                                     │  │
│  │  │   └── {projectId}/                                             │  │
│  │  │       ├── project.json          # 项目基本信息                  │  │
│  │  │       └── ontology.json         # 项目 Ontology                │  │
│  │  ├── taste/                                                        │  │
│  │  │   ├── users/{userId}/                                          │  │
│  │  │   │   └── profile.json          # User TASTE (C.1)             │  │
│  │  │   └── projects/{projectId}/                                    │  │
│  │  │       └── profile.json          # Project TASTE                │  │
│  │  └── sessions/                                                     │  │
│  │      └── project-creation/{sessionId}.json  # 访谈会话             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户输入 → API Layer → Service Layer → 存储
                            │
                            ├─→ TasteExtractionService → Project TASTE
                            ├─→ OntologyBuilderService → Ontology
                            └─→ TASTEMergeService → 融合 TASTE
```

---

## 3. API 设计

### 3.1 POST /api/project/create/start

**描述:** 开始项目创建访谈

**请求:**
```typescript
interface StartProjectCreationRequest {
  userId: string;                    // 用户 ID
  projectName?: string;              // 项目名称（可选）
  defaultValues?: {                  // 默认值（可选）
    background?: string;
    priorities?: string[];
    workMode?: 'solo' | 'team' | 'product-owner' | 'custom';
  };
}
```

**响应:**
```typescript
interface StartProjectCreationResponse {
  sessionId: string;                 // 会话 ID
  projectId: string;                 // 项目 ID（预分配）
  currentStep: 1;                    // 当前步骤
  question: {                        // 第一个问题
    id: string;
    text: string;
    type: 'text' | 'choice' | 'mixed';
    placeholder?: string;
    hint?: string;
    options?: QuestionOption[];
  };
  progress: {
    current: 1;
    total: 4;
    percentage: 25;
  };
}
```

**存储:**
```json
// data/sessions/project-creation/{sessionId}.json
{
  "sessionId": "pc_{uuid}",
  "projectId": "proj_{uuid}",
  "userId": "user_123",
  "status": "active",
  "currentStep": 1,
  "data": {
    "name": null,
    "background": null,
    "priorities": [],
    "workMode": null,
    "customDescriptions": {}
  },
  "extractedData": {
    "experience_topology": [],
    "context_features": {},
    "taste_standards": {},
    "tension_position": null,
    "symbiosis_boundary": null
  },
  "createdAt": "2026-03-12T10:00:00Z",
  "updatedAt": "2026-03-12T10:00:00Z"
}
```

### 3.2 POST /api/project/create/:sessionId/question

**描述:** 获取当前步骤的问题

**请求:**
```typescript
interface GetQuestionRequest {
  sessionId: string;                 // 路径参数
}
```

**响应:**
```typescript
interface GetQuestionResponse {
  sessionId: string;
  currentStep: number;               // 1-4
  question: {
    id: string;
    step: number;
    text: string;
    type: 'text' | 'choice' | 'mixed';
    placeholder?: string;
    hint?: string;
    options?: QuestionOption[];      // 选择题选项
    allowMultiple?: boolean;         // 是否多选
    allowCustom?: boolean;           // 是否允许自定义
  };
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  canGoBack: boolean;                // 是否可以返回上一步
  canSkip: boolean;                  // 是否可以跳过
}

interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}
```

**问题配置:**

```typescript
const PROJECT_CREATION_QUESTIONS = [
  {
    step: 1,
    id: 'background',
    text: '这个项目主要是做什么的？',
    type: 'text',
    placeholder: '例如：给电商网站做库存管理系统...',
    hint: '自然描述即可，比如：产品类型、使用的技术、解决的问题...',
    allowSkip: true,
  },
  {
    step: 2,
    id: 'priorities',
    text: '这个项目最重要的是什么？',
    type: 'choice',
    options: [
      { value: 'velocity', label: '快速上线', description: '先把功能做出来，后续再优化' },
      { value: 'stability', label: '稳定可靠', description: '代码质量高，减少 bug 和维护成本' },
      { value: 'maintainability', label: '易于维护', description: '结构清晰，方便后续扩展和团队协作' },
    ],
    allowMultiple: true,
    allowCustom: true,
    allowSkip: true,
  },
  {
    step: 3,
    id: 'workMode',
    text: '你希望怎么使用这个项目？',
    type: 'choice',
    options: [
      { value: 'solo', label: '我自己开发和维护', icon: '👤', description: '全程自己掌控，AI 辅助具体任务' },
      { value: 'team', label: '和小团队一起协作', icon: '👥', description: '团队成员共同贡献，AI 帮助协调' },
      { value: 'product-owner', label: '交给其他人使用', icon: '🎯', description: '我是产品角色，AI 帮我实现想法' },
    ],
    allowMultiple: false,
    allowCustom: true,
    allowSkip: true,
  },
  {
    step: 4,
    id: 'confirm',
    text: '确认项目信息',
    type: 'confirm',
    allowSkip: false,
  },
];
```

### 3.3 POST /api/project/create/:sessionId/answer

**描述:** 提交当前步骤的回答

**请求:**
```typescript
interface SubmitAnswerRequest {
  sessionId: string;                 // 路径参数
  step: number;                      // 当前步骤
  answer: {
    type: 'text' | 'choice' | 'confirm';
    value: string | string[] | object;
    customDescription?: string;      // 自定义描述
  };
}
```

**响应:**
```typescript
interface SubmitAnswerResponse {
  sessionId: string;
  step: number;
  saved: boolean;
  nextStep: number | null;           // null 表示完成
  nextQuestion?: Question;           // 下一个问题
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}
```

**后台处理（隐形提取）:**

```typescript
// 提交回答后，后台自动提取 TASTE 数据
async function processAnswer(sessionId: string, step: number, answer: Answer) {
  const session = await getSession(sessionId);

  switch (step) {
    case 1:
      // 隐性提取: Experience Topology + Context Features
      session.extractedData.experience_topology =
        await extractExperienceTopology(answer.value);
      session.extractedData.context_features =
        await extractContextFeatures(answer.value);
      break;

    case 2:
      // 隐性提取: Taste Standards + Tension Position
      session.extractedData.taste_standards =
        await extractTasteStandards(answer.value);
      session.extractedData.tension_position =
        await extractTensionPosition(answer.value);
      break;

    case 3:
      // 隐性提取: Symbiosis Boundary
      session.extractedData.symbiosis_boundary =
        await extractSymbiosisBoundary(answer.value);
      break;
  }

  await saveSession(session);
}
```

### 3.4 POST /api/project/create/:sessionId/complete

**描述:** 完成访谈，创建项目

**请求:**
```typescript
interface CompleteCreationRequest {
  sessionId: string;                 // 路径参数
  projectName: string;               // 项目名称（必填）
  confirmData: {                     // 确认数据
    background?: string;
    priorities?: string[];
    workMode?: string;
  };
}
```

**响应:**
```typescript
interface CompleteCreationResponse {
  success: boolean;
  project: {
    id: string;
    name: string;
    createdAt: string;
    path: string;                    // 项目路径
  };
  taste: {                           // 用户不可见
    generated: boolean;
    confidence: number;
  };
  ontology: {                        // 用户不可见
    generated: boolean;
    domainCount: number;
  };
}
```

**后台处理（完成时）:**

```typescript
async function completeProjectCreation(sessionId: string, projectName: string) {
  const session = await getSession(sessionId);

  // 1. 创建项目
  const project = await createProject({
    id: session.projectId,
    name: projectName,
    userId: session.userId,
    createdAt: new Date().toISOString(),
  });

  // 2. 生成 Project TASTE（后台）
  const projectTaste = await generateProjectTASTE(session.extractedData);
  await saveProjectTASTE(session.projectId, projectTaste);

  // 3. 构建初始 Ontology（后台）
  const ontology = await buildOntology(session.extractedData);
  await saveOntology(session.projectId, ontology);

  // 4. 融合 User TASTE + Project TASTE（后台）
  const userTaste = await loadUserTASTE(session.userId);
  if (userTaste) {
    const mergedTaste = await mergeTASTEProfiles(userTaste, projectTaste);
    await saveMergedTASTE(session.projectId, session.userId, mergedTaste);
  }

  // 5. 更新会话状态
  await updateSessionStatus(sessionId, 'completed');

  return { project, taste: projectTaste, ontology };
}
```

### 3.5 GET /api/project/create/:sessionId/status

**描述:** 查询访谈状态

**请求:**
```typescript
interface GetStatusRequest {
  sessionId: string;                 // 路径参数
}
```

**响应:**
```typescript
interface GetStatusResponse {
  sessionId: string;
  projectId: string;
  status: 'active' | 'completed' | 'expired' | 'failed';
  currentStep: number;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  data: {
    name?: string;
    background?: string;
    priorities?: string[];
    workMode?: string;
  };
  canResume: boolean;                // 是否可以继续
  expiresAt?: string;                // 过期时间
}
```

---

## 4. 数据存储设计

### 4.1 会话状态存储

**路径:** `data/sessions/project-creation/{sessionId}.json`

```typescript
interface ProjectCreationSession {
  version: string;                   // '1.0.0'
  sessionId: string;                 // pc_{uuid}
  projectId: string;                 // proj_{uuid}（预分配）
  userId: string;

  // 会话状态
  status: 'active' | 'completed' | 'expired' | 'failed';
  currentStep: number;               // 1-4
  maxSteps: number;                  // 4

  // 用户输入数据
  data: {
    name: string | null;
    background: string | null;
    priorities: string[];
    workMode: 'solo' | 'team' | 'product-owner' | 'custom' | null;
    customDescriptions: {
      priorities?: string;
      workMode?: string;
    };
  };

  // 隐性提取数据（用户不可见）
  extractedData: {
    experience_topology: string[];
    context_features: {
      domain: string;
      task_type: string;
      tech_stack: string[];
      discourse_system: 'technical' | 'business' | 'mixed';
    };
    taste_standards: Record<string, {
      positive_vibes: string[];
      negative_vibes: string[];
    }>;
    tension_position: {
      control_level: number;
      trust_level: number;
      intervention_threshold: number;
    } | null;
    symbiosis_boundary: {
      delegated_domains: string[];
      reserved_domains: string[];
      contextual_triggers: string[];
      control_level: number;
    } | null;
  };

  // 时间戳
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt: string;                 // 24 小时后过期

  // 错误处理
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
}
```

### 4.2 Project TASTE 存储

**路径:** `data/taste/projects/{projectId}/profile.json`

**复用 C.1 的 TASTEProfile Schema:**

```typescript
interface ProjectTASTEProfile {
  version: string;                   // '1.0.0'
  id: string;
  projectId: string;
  userId?: string;                   // 创建者

  // Dimension 1: Experience Topology
  experience_topology: string[];

  // Dimension 2: Taste Standards
  taste_standards: Record<string, {
    positive_vibes: string[];
    negative_vibes: string[];
  }>;

  // Dimension 3: Tension Position
  tension_position: {
    control_level: number;
    trust_level: number;
    intervention_threshold: number;
  };

  // Dimension 4: Symbiosis Boundary
  symbiosis_boundary: {
    delegated_domains: string[];
    reserved_domains: string[];
    contextual_triggers: string[];
  };

  // Metadata
  metadata: {
    source: 'project';               // 标识为 Project TASTE
    confidence: number;
    evolution_count: number;
    derived_from_session: string;     // 关联到访谈会话
    last_analysis_at: string;
  };

  // 时间戳
  createdAt: string;
  updatedAt: string;
}
```

### 4.3 Ontology 存储

**路径:** `data/ontologies/{projectId}/ontology.json`

```typescript
interface ProjectOntology {
  version: string;                   // '1.0.0'
  projectId: string;

  // Domain Layer
  domains: OntologyDomain[];

  // Concept Layer
  concepts: OntologyConcept[];

  // Instance Layer (初始为空)
  instances: OntologyInstance[];

  // Relations
  relations: OntologyRelation[];

  // Metadata
  metadata: {
    derived_from_session: string;
    generated_at: string;
    confidence: number;
  };

  createdAt: string;
  updatedAt: string;
}

interface OntologyDomain {
  id: string;
  name: string;
  description?: string;
  confidence: number;
}

interface OntologyConcept {
  id: string;
  domainId: string;
  name: string;
  type: string;
  attributes?: Record<string, unknown>;
  confidence: number;
}

interface OntologyInstance {
  id: string;
  conceptId: string;
  name: string;
  attributes: Record<string, unknown>;
}

interface OntologyRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
}
```

### 4.4 项目基本信息

**路径:** `data/projects/{projectId}/project.json`

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  userId: string;

  // 项目元数据
  metadata: {
    type?: string;                   // 从访谈中提取的项目类型
    domain?: string;                 // 业务领域
    techStack?: string[];            // 技术栈
    workMode?: string;               // 工作模式
  };

  // 状态
  status: 'active' | 'archived' | 'deleted';

  // 关联
  tasteProfileId?: string;           // 关联 Project TASTE
  ontologyId?: string;               // 关联 Ontology

  createdAt: string;
  updatedAt: string;
}
```

---

## 5. 隐性提取服务设计

### 5.1 TasteExtractionService

**复用 C.1 CultureDetectionService 模式**

```typescript
// src/lib/project/taste-extraction.ts

export class TasteExtractionService {

  /**
   * 从项目背景描述中提取 Experience Topology
   * Step 1 隐性提取
   */
  async extractExperienceTopology(background: string): Promise<string[]> {
    const prompt = this.buildBackgroundPrompt(background);
    const result = await this.callLLM(prompt);
    return result.experience_topology;
  }

  /**
   * 从项目背景描述中提取 Context Features
   * Step 1 隐性提取
   */
  async extractContextFeatures(background: string): Promise<ContextFeatures> {
    const prompt = this.buildContextPrompt(background);
    return await this.callLLM(prompt);
  }

  /**
   * 从优先级选择中提取 Taste Standards
   * Step 2 隐性提取
   */
  async extractTasteStandards(
    priorities: string[],
    customDescription?: string
  ): Promise<Record<string, TasteStandard>> {
    const prompt = this.buildPrioritiesPrompt(priorities, customDescription);
    return await this.callLLM(prompt);
  }

  /**
   * 从优先级选择中推断 Tension Position
   * Step 2 隐性提取
   */
  async extractTensionPosition(
    priorities: string[],
    customDescription?: string
  ): Promise<TensionPosition> {
    const prompt = this.buildTensionPrompt(priorities, customDescription);
    return await this.callLLM(prompt);
  }

  /**
   * 从工作模式中推断 Symbiosis Boundary
   * Step 3 隐性提取
   */
  async extractSymbiosisBoundary(
    workMode: string,
    customDescription?: string
  ): Promise<SymbiosisBoundary> {
    // 优先使用预设映射
    const presetMapping = this.getPresetSymbiosisBoundary(workMode);
    if (presetMapping && !customDescription) {
      return presetMapping;
    }

    // 自定义描述需要 LLM 分析
    const prompt = this.buildWorkModePrompt(workMode, customDescription);
    return await this.callLLM(prompt);
  }

  /**
   * 预设工作模式到共生边界的映射
   */
  private getPresetSymbiosisBoundary(workMode: string): SymbiosisBoundary | null {
    const presets: Record<string, SymbiosisBoundary> = {
      'solo': {
        delegated_domains: [],
        reserved_domains: ['all'],
        contextual_triggers: [],
        control_level: 0.9,
      },
      'team': {
        delegated_domains: ['document-generation', 'code-formatting', 'testing'],
        reserved_domains: ['architecture-decisions', 'database-schema'],
        contextual_triggers: ['team-review-required'],
        control_level: 0.5,
      },
      'product-owner': {
        delegated_domains: ['implementation', 'testing', 'documentation'],
        reserved_domains: ['requirements', 'priorities'],
        contextual_triggers: ['milestone-review'],
        control_level: 0.3,
      },
    };

    return presets[workMode] || null;
  }

  /**
   * 生成完整的 Project TASTE
   */
  async generateProjectTASTE(
    extractedData: ExtractedData,
    projectId: string,
    sessionId: string
  ): Promise<ProjectTASTEProfile> {
    return {
      version: '1.0.0',
      id: `taste_proj_${projectId}`,
      projectId,

      experience_topology: extractedData.experience_topology,
      taste_standards: extractedData.taste_standards,
      tension_position: extractedData.tension_position || this.getDefaultTensionPosition(),
      symbiosis_boundary: extractedData.symbiosis_boundary || this.getDefaultSymbiosisBoundary(),

      metadata: {
        source: 'project',
        confidence: this.calculateConfidence(extractedData),
        evolution_count: 0,
        derived_from_session: sessionId,
        last_analysis_at: new Date().toISOString(),
      },

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getDefaultTensionPosition(): TensionPosition {
    return {
      control_level: 0.5,
      trust_level: 0.5,
      intervention_threshold: 0.5,
    };
  }

  private getDefaultSymbiosisBoundary(): SymbiosisBoundary {
    return {
      delegated_domains: ['document-generation'],
      reserved_domains: ['architecture-decisions'],
      contextual_triggers: [],
      control_level: 0.5,
    };
  }

  private calculateConfidence(extractedData: ExtractedData): number {
    // 根据提取的数据完整度计算置信度
    let score = 0;
    if (extractedData.experience_topology.length > 0) score += 0.25;
    if (Object.keys(extractedData.taste_standards).length > 0) score += 0.25;
    if (extractedData.tension_position) score += 0.25;
    if (extractedData.symbiosis_boundary) score += 0.25;
    return score;
  }
}
```

### 5.2 OntologyBuilderService

```typescript
// src/lib/project/ontology-builder.ts

export class OntologyBuilderService {

  /**
   * 从项目背景构建初始 Ontology
   */
  async buildOntology(extractedData: ExtractedData): Promise<ProjectOntology> {
    // 1. 提取领域
    const domains = await this.extractDomains(extractedData.experience_topology);

    // 2. 为每个领域生成概念
    const concepts = await this.generateConcepts(domains, extractedData);

    // 3. 推断概念关系
    const relations = await this.inferRelations(concepts);

    return {
      version: '1.0.0',
      projectId: '', // 由调用者填充
      domains,
      concepts,
      instances: [], // 初始为空
      relations,
      metadata: {
        derived_from_session: extractedData.sessionId,
        generated_at: new Date().toISOString(),
        confidence: this.calculateOntologyConfidence(domains, concepts),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 从 Experience Topology 提取领域
   */
  private async extractDomains(experienceTopology: string[]): Promise<OntologyDomain[]> {
    // 使用 LLM 进行领域识别
    const prompt = `
分析以下经验领域，识别项目涉及的业务领域：

经验领域: ${JSON.stringify(experienceTopology)}

请提取：
1. 主要业务领域（2-3个）
2. 每个领域的简短描述

返回 JSON 格式：
{
  "domains": [
    { "name": "领域名称", "description": "领域描述", "confidence": 0.0-1.0 }
  ]
}
`;

    const result = await this.callLLM(prompt);
    return result.domains.map((d: any, index: number) => ({
      id: `domain_${index}`,
      name: d.name,
      description: d.description,
      confidence: d.confidence,
    }));
  }

  /**
   * 为每个领域生成概念
   */
  private async generateConcepts(
    domains: OntologyDomain[],
    extractedData: ExtractedData
  ): Promise<OntologyConcept[]> {
    const concepts: OntologyConcept[] = [];

    for (const domain of domains) {
      const domainConcepts = await this.generateDomainConcepts(domain, extractedData);
      concepts.push(...domainConcepts);
    }

    return concepts;
  }

  /**
   * 推断概念之间的关系
   */
  private async inferRelations(concepts: OntologyConcept[]): Promise<OntologyRelation[]> {
    // 简单的关系推断逻辑
    // Phase 1.5 可以使用 LLM 进行更复杂的关系推断
    const relations: OntologyRelation[] = [];

    // 同一领域的概念可能有关联
    const domainGroups = this.groupByDomain(concepts);

    for (const [domainId, domainConcepts] of Object.entries(domainGroups)) {
      // 为同一领域的概念创建关联
      for (let i = 0; i < domainConcepts.length - 1; i++) {
        relations.push({
          id: `rel_${relations.length}`,
          sourceId: domainConcepts[i].id,
          targetId: domainConcepts[i + 1].id,
          type: 'related_to',
          confidence: 0.5,
        });
      }
    }

    return relations;
  }
}
```

---

## 6. 两层 TASTE 融合设计

### 6.1 融合时机

```
用户创建项目
     │
     ▼
完成访谈 → 生成 Project TASTE
     │
     ▼
检查 User TASTE 是否存在
     │
     ├── 存在 → 融合 User TASTE + Project TASTE → 保存 Merged TASTE
     │
     └── 不存在 → 仅保存 Project TASTE
```

### 6.2 融合服务

```typescript
// src/lib/taste/taste-merge.ts (复用 C.1)

export function mergeTASTEProfiles(
  userTASTE: TASTEProfile,
  projectTASTE: TASTEProfile
): TASTEProfile {
  return {
    version: '1.0.0',
    id: `merged_${projectTASTE.projectId}`,
    projectId: projectTASTE.projectId,
    userId: userTASTE.userId,

    // Experience Topology: 合并去重
    experience_topology: [
      ...userTASTE.experience_topology,
      ...projectTASTE.experience_topology,
    ].filter((v, i, a) => a.indexOf(v) === i),

    // Taste Standards: Project 优先（同一 domain）
    taste_standards: {
      ...userTASTE.taste_standards,
      ...projectTASTE.taste_standards,
    },

    // Tension Position: 加权平均（Project 权重 0.7）
    tension_position: {
      control_level: weightedAverage(
        userTASTE.tension_position.control_level,
        projectTASTE.tension_position.control_level,
        0.3
      ),
      trust_level: weightedAverage(
        userTASTE.tension_position.trust_level,
        projectTASTE.tension_position.trust_level,
        0.3
      ),
      intervention_threshold: projectTASTE.tension_position.intervention_threshold,
    },

    // Symbiosis Boundary: 合并
    symbiosis_boundary: {
      delegated_domains: [
        ...userTASTE.symbiosis_boundary.delegated_domains,
        ...projectTASTE.symbiosis_boundary.delegated_domains,
      ].filter((v, i, a) => a.indexOf(v) === i),
      reserved_domains: [
        ...userTASTE.symbiosis_boundary.reserved_domains,
        ...projectTASTE.symbiosis_boundary.reserved_domains,
      ].filter((v, i, a) => a.indexOf(v) === i),
      contextual_triggers: [
        ...userTASTE.symbiosis_boundary.contextual_triggers,
        ...projectTASTE.symbiosis_boundary.contextual_triggers,
      ].filter((v, i, a) => a.indexOf(v) === i),
    },

    metadata: {
      source: 'merged',
      confidence: Math.max(
        userTASTE.metadata.confidence,
        projectTASTE.metadata.confidence
      ),
      evolution_count:
        userTASTE.metadata.evolution_count +
        projectTASTE.metadata.evolution_count,
      last_analysis_at: new Date().toISOString(),
    },

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function weightedAverage(a: number, b: number, weightA: number): number {
  return a * weightA + b * (1 - weightA);
}
```

### 6.3 存储路径

```
data/taste/
├── users/{userId}/
│   └── profile.json              # User TASTE (C.1)
│
├── projects/{projectId}/
│   └── profile.json              # Project TASTE
│
└── merged/{userId}/{projectId}/
    └── profile.json              # Merged TASTE
```

---

## 7. 与 C.1 的集成

### 7.1 复用的基础设施

| 组件 | 来源 | 复用方式 |
|-----|------|---------|
| `TASTEProfileSchema` | C.1 | 直接复用 |
| `CultureDetectionMessage` | C.1 | 复用消息格式 |
| `TasteExtractionService` | C.1 | 扩展用于项目维度 |
| `mergeTASTEProfiles` | C.1 | 直接复用 |
| 文件存储模式 | C.1 | 相同存储结构 |

### 7.2 差异对比

| 方面 | C.1 用户维度 | C.5 项目维度 |
|-----|------------|------------|
| 用户感知 | "了解我的风格" | "创建项目" |
| 交互方式 | 对话式 | 表单式 |
| 问题风格 | 开放式对话 | 半结构化问答 |
| TASTE 来源 | User TASTE | Project TASTE |
| 隐形程度 | 隐形但明确 | 完全隐形 |
| 额外产出 | 无 | Ontology |

### 7.3 共享服务接口

```typescript
// src/lib/taste/taste-service.ts

export interface ITasteService {
  // C.1: User TASTE
  createUserTASTE(userId: string, sessionData: any): Promise<TASTEProfile>;
  loadUserTASTE(userId: string): Promise<TASTEProfile | null>;

  // C.5: Project TASTE
  createProjectTASTE(projectId: string, sessionData: any): Promise<TASTEProfile>;
  loadProjectTASTE(projectId: string): Promise<TASTEProfile | null>;

  // 融合
  loadMergedTASTE(userId: string, projectId: string): Promise<TASTEProfile | null>;
}
```

---

## 8. 错误处理

### 8.1 错误代码

| 代码 | 描述 | HTTP 状态 |
|-----|------|----------|
| `SESSION_NOT_FOUND` | 会话不存在 | 404 |
| `SESSION_EXPIRED` | 会话已过期 | 410 |
| `INVALID_STEP` | 无效的步骤 | 400 |
| `INVALID_ANSWER` | 无效的回答 | 400 |
| `PROJECT_NAME_REQUIRED` | 项目名称必填 | 400 |
| `TASTE_GENERATION_FAILED` | TASTE 生成失败 | 500 |
| `ONTOLOGY_BUILD_FAILED` | Ontology 构建失败 | 500 |
| `STORAGE_ERROR` | 存储错误 | 500 |

### 8.2 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}
```

### 8.3 降级策略

1. **LLM 提取失败** → 使用默认值填充 TASTE
2. **Ontology 构建失败** → 创建空 Ontology，用户后续手动补充
3. **TASTE 融合失败** → 仅保存 Project TASTE

```typescript
async function handleExtractionFailure(
  extractedData: ExtractedData,
  error: Error
): Promise<ExtractedData> {
  console.error('[TasteExtraction] Failed:', error);

  // 使用默认值
  return {
    ...extractedData,
    experience_topology: extractedData.experience_topology.length > 0
      ? extractedData.experience_topology
      : ['general-development'],
    taste_standards: Object.keys(extractedData.taste_standards).length > 0
      ? extractedData.taste_standards
      : { 'general': { positive_vibes: ['clean-code'], negative_vibes: ['complexity'] } },
    tension_position: extractedData.tension_position || {
      control_level: 0.5,
      trust_level: 0.5,
      intervention_threshold: 0.5,
    },
    symbiosis_boundary: extractedData.symbiosis_boundary || {
      delegated_domains: ['document-generation'],
      reserved_domains: ['architecture-decisions'],
      contextual_triggers: [],
      control_level: 0.5,
    },
  };
}
```

---

## 9. 性能考虑

### 9.1 性能目标

| 操作 | 目标时间 | 说明 |
|-----|---------|------|
| 开始访谈 | < 500ms | 创建会话 |
| 提交回答 | < 1s | 保存 + 后台提取 |
| 完成创建 | < 3s | 项目创建 + TASTE + Ontology |
| 状态查询 | < 200ms | 读取会话 |

### 9.2 优化策略

1. **异步处理**: LLM 提取和 Ontology 构建异步进行
2. **缓存**: 会话数据缓存到内存
3. **预设映射**: 工作模式使用预设映射，避免 LLM 调用
4. **并发提取**: Step 1 和 Step 2 的提取可并发

```typescript
// 并发提取示例
async function extractTasteDataConcurrently(
  session: ProjectCreationSession
): Promise<ExtractedData> {
  const [topology, features, standards, tension, boundary] = await Promise.all([
    session.data.background
      ? this.extractExperienceTopology(session.data.background)
      : Promise.resolve([]),
    session.data.background
      ? this.extractContextFeatures(session.data.background)
      : Promise.resolve({}),
    session.data.priorities.length > 0
      ? this.extractTasteStandards(session.data.priorities, session.data.customDescriptions.priorities)
      : Promise.resolve({}),
    session.data.priorities.length > 0
      ? this.extractTensionPosition(session.data.priorities, session.data.customDescriptions.priorities)
      : Promise.resolve(null),
    session.data.workMode
      ? this.extractSymbiosisBoundary(session.data.workMode, session.data.customDescriptions.workMode)
      : Promise.resolve(null),
  ]);

  return {
    experience_topology: topology,
    context_features: features,
    taste_standards: standards,
    tension_position: tension,
    symbiosis_boundary: boundary,
  };
}
```

---

## 10. 安全考虑

### 10.1 输入验证

- 项目名称长度限制
- 回答内容长度限制
- 自定义描述内容过滤

### 10.2 会话安全

- 会话 ID 使用 UUID
- 会话 24 小时过期
- 用户只能访问自己的会话

### 10.3 数据隔离

- 用户间数据完全隔离
- 项目 TASTE 只能被项目成员访问

---

## 11. 部署考虑

### 11.1 文件存储路径

```
data/
├── projects/{projectId}/
│   ├── project.json
│   └── ontology.json
│
├── taste/
│   ├── users/{userId}/
│   │   └── profile.json
│   ├── projects/{projectId}/
│   │   └── profile.json
│   └── merged/{userId}/{projectId}/
│       └── profile.json
│
└── sessions/
    ├── culture-detection/{sessionId}.json  (C.1)
    └── project-creation/{sessionId}.json   (C.5)
```

### 11.2 环境变量

```bash
# 访谈会话过期时间（小时）
PROJECT_CREATION_SESSION_EXPIRY=24

# 最大问题数
PROJECT_CREATION_MAX_STEPS=4

# LLM 配置（复用 C.1）
LLM_MODEL=claude-3-haiku-20240307
LLM_TEMPERATURE=0.7
```

---

## 12. 测试策略

### 12.1 单元测试

- TasteExtractionService 提取逻辑
- OntologyBuilderService 构建逻辑
- mergeTASTEProfiles 融合逻辑
- 预设映射正确性

### 12.2 集成测试

- API 端点完整流程
- 会话状态管理
- TASTE 生成流程
- Ontology 构建流程

### 12.3 E2E 测试

- 用户完成完整访谈流程
- 跳过步骤使用默认值
- 取消访谈清理会话
- 融合 User + Project TASTE

---

## 13. 文件清单

| 文件 | 描述 |
|------|------|
| `src/app/api/project/create/start/route.ts` | 开始访谈 API |
| `src/app/api/project/create/[sessionId]/question/route.ts` | 获取问题 API |
| `src/app/api/project/create/[sessionId]/answer/route.ts` | 提交回答 API |
| `src/app/api/project/create/[sessionId]/complete/route.ts` | 完成创建 API |
| `src/app/api/project/create/[sessionId]/status/route.ts` | 状态查询 API |
| `src/lib/project/project-creation-service.ts` | 访谈服务 |
| `src/lib/project/taste-extraction.ts` | TASTE 提取服务 |
| `src/lib/project/ontology-builder.ts` | Ontology 构建服务 |
| `src/types/project-creation.ts` | 类型定义 |
| `docs/specs/epic-C/story-C.5/api-design.md` | 本文档 |

---

## 14. 相关文档

- [Epic C README](../README.md)
- [Story C.5 UX 设计](./ux-design.md)
- [Story C.1 架构评审](../story-C.1/architecture-review.md)
- [TASTE 类型定义](../../../../src/types/taste.ts)
- [两层 TASTE 架构评估](../../../../docs/design/two-layer-taste-architecture-assessment.md)

---

## 15. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|---------|-------|
| 2026-03-12 | 1.0.0 | 初始版本 | System Architect |

---

**批准签名:**

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
