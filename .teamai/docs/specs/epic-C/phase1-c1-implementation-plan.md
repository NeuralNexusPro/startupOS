# Phase 1: C.1 用户维度文化检测 - 实施计划

**Epic:** Epic C: Phase 1 认知功能实现
**Story:** C.1 用户维度文化检测（首次 Onboarding）
**状态:** Planning → Ready for Development
**优先级:** Critical
**预计工期:** 10 工作日（Week 1-2）

---

## 📋 执行摘要

Phase 1 的唯一目标是实现**用户维度文化检测**功能。通过 3-5 轮自然对话，隐性提取用户的品味信号，生成 User TASTE.md 草稿。

**核心原则：**
- ✅ 不问抽象问题
- ✅ 隐性提取品味线索
- ✅ 使用现有 pi-agent 能力
- ✅ 数据结构支持两层架构

---

## 🎯 验收标准

### 功能验收

- [ ] 3-5 轮对话流畅自然，用户不感觉"被测试"
- [ ] LLM 抽取准确率 > 60%（用户验证）
- [ ] User TASTE.md 生成正确
- [ ] 数据支持 Phase 3 完整 4 维度

### 性能验收

- [ ] LLM 分析时间: < 5 秒
- [ ] API 响应时间: < 1 秒（不含 LLM）
- [ ] TASTE.md 生成: < 200ms

### 架构验收

- [ ] 两层架构预留（Project TASTE 字段）
- [ ] pi-agent 集成正常
- [ ] 数据结构可扩展到 Phase 3

---

## 🏗️ 技术架构

### API 端点（4 个）

```typescript
// 1. 启动用户维度检测会话
POST /api/taste/user/detection/start
// Request: { userId: string }
// Response: { sessionId: string, firstQuestion: string }

// 2. 发送对话消息
POST /api/taste/user/detection/:sessionId/message
// Request: { message: string, turn: number }
// Response: { nextQuestion?: string, isComplete: boolean }

// 3. 触发 LLM 分析
POST /api/taste/user/detection/:sessionId/analyze
// Request: {}
// Response: { analysisId: string }

// 4. 获取 TASTE 草稿
GET /api/taste/user/detection/:sessionId/taste-draft
// Request: {}
// Response: { tasteProfile: TASTEProfile, confidence: number }
```

### 数据存储

```json
// data/taste/users/{userId}/profile.json
{
  "version": "1.0.0",
  "userId": "user-123",
  "createdAt": "2026-03-07T12:00:00Z",
  "updatedAt": "2026-03-07T12:15:00Z",
  "source": "onboarding-dialogue",

  "experience_topology": [
    "code-review",
    "architecture-design",
    "integration-testing"
  ],

  "taste_standards": {
    "code-review": {
      "positive_vibes": [
        "constructive specific suggestions",
        "context-aware feedback"
      ],
      "negative_vibes": [
        "nitpicking formatting",
        "ignoring logic for style"
      ]
    }
  },

  "tension_position": {
    "control_level": 0.6,
    "trust_level": 0.5,
    "intervention_threshold": 0.7
  },

  "symbiosis_boundary": {
    "delegated_domains": ["documentation"],
    "reserved_domains": ["security-reviews"],
    "contextual_triggers": ["critical-bug"]
  },

  "metadata": {
    "source": "user",
    "confidence": 0.75,
    "evolution_count": 0,
    "derived_from_session": "session-456"
  }
}
```

### 集成方式

```typescript
// src/lib/integrations/pi-agent/hooks.ts
export function useCultureDetection() {
  const { sendMessage } = usePiAgent();

  const startDetection = async (userId: string) => {
    return await api.post('/api/taste/user/detection/start', { userId });
  };

  const addMessage = async (sessionId: string, message: string) => {
    // 使用 pi-agent 发送消息
    const response = await sendMessage(message);
    // 同时记录到文化检测会话
    return await api.post(`/api/taste/user/detection/${sessionId}/message`, {
      message,
      turn: response.turn
    });
  };

  const analyze = async (sessionId: string) => {
    return await api.post(`/api/taste/user/detection/${sessionId}/analyze`);
  };

  const getTasteDraft = async (sessionId: string) => {
    return await api.get(`/api/taste/user/detection/${sessionId}/taste-draft`);
  };

  return { startDetection, addMessage, analyze, getTasteDraft };
}
```

---

## 📝 对话设计

### 对话流程

```
┌─────────────────────────────────────────────────────────────┐
│  欢迎使用 OriginOS                                            │
├─────────────────────────────────────────────────────────────┤
│                                                                     │
│  让我们互相了解一下，这样我能更好地为你服务。                     │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━      │
│                                                                     │
│  Q1: 你最近在做什么类型的项目？                                   │
│  [用户输入...]                                                     │
│                                                                     │
│  Q2: 你在项目中的主要角色是什么？                                 │
│  [用户输入...]                                                     │
│                                                                     │
│  Q3: 你在编码时最在意什么？                                       │
│  [用户输入...]                                                     │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━      │
│                                                                     │
│  ✅ 谢谢！我已经了解你的风格了。                              │
│                                                                     │
│  [继续使用 OriginOS]                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
```

### 对话脚本示例

#### Turn 1: 启动

**System:**
```
欢迎使用 OriginOS！

让我们互相了解一下，这样我能更好地为你服务。

最近在做什么类型的项目？（比如：Web 应用、移动应用、数据平台...）
```

**User:**
```
我在做一个 React 的企业级管理系统，主要是内部业务流程的数字化。
```

#### Turn 2: 角色

**System:**
```
我明白了，React 企业级管理系统。

在这个项目中，你主要负责部分？（比如：前端开发、架构设计、全栈、测试...）
```

**User:**
```
主要做前端开发，偶尔也要处理一些后端接口。
```

#### Turn 3: 价值

**System:**
```
好的，前端为主，也兼顾一些后端。

在开发这个项目时，你觉得什么样或什么样的做法是你更关注的？
```

**User:**
```
我比较关注代码的可维护性，尽量保持简单清晰，不想过度设计。
```

#### Turn 4: 分析

**System:**
```
已分析完成。

我发现：
```
  你主要关注可维护性
  你在 React 企业级管理系统项目中
  你更喜欢简单清晰的代码，避免过度设计
```

继续使用 OriginOS [继续]
```

### LLM 提示结构

```typescript
// 用于提取品味的 LLM 提示
const EXTRACT_TASTE_PROMPT = `
你是一个系统品味分析助手。分析用户的对话，从以下维度提取品味信号：

1. 经验拓扑 (Experience Topology) - 具身感知领域
   - 用户提到的项目类型、技术栈、工作领域
   - 例如："React"、"企业级系统"、"前端开发"

2. 品味标准 (Taste Standards) - 对/扭曲感觉描述
   - 用户正面描述的偏好（我喜欢...）
   - 用户负面描述的反对（我不喜欢...）
   - 例如："可维护性"、"简单清晰"、"避免过度设计"

3. 张力位置 (Tension Position) - 初步的控制/信任倾向
   - 从用户的用词推断初步倾向
   - 如果不明显，设置默认值（control_level: 0.5）

4. 共生边界 (Symbiosis Boundary) - 初步委托/保留倾向
   - 用户提到的特别在意或保留的领域
   - 如果不明显，设置默认值

输出格式示例：
\`\`\`json
{
  "experience_topology": ["react", "enterprise-systems", "frontend"],
  "taste_standards": {
    "development": {
      "positive_vibes": ["可维护性", "简单清晰"],
      "negative_vibes": ["过度设计"]
    }
  },
  "tension_position": {
    "control_level": 0.5,
    "trust_level": 0.5,
    "intervention_threshold": 0.7
  },
  "symbiosis_boundary": {
    "delegated_domains": [],
    "reserved_domains": [],
    "contextual_triggers": []
  },
  "confidence": 0.75,
  "evidence_quotes": ["我比较关注代码的可维护性", "尽量保持简单清晰"]
}
\`\`\`

现在分析以下对话：

对话 JSON: ${JSON.stringify(dialogueHistory)}
`;
```

---

## 🗂️ 文件结构

```
src/lib/features/culture/
├── api/
│   ├── user-detection.ts           # API 路由处理
│   └── endpoints.ts                # 端点定义
│
├── services/
│   ├── CultureSessionService.ts    # 对话会话管理
│   ├── CultureDetectionService.ts  # LLM 分析服务
│   └── TasteDraftBuilder.ts        # TASTE 草稿构建
│
├── types/
│   ├── culture.types.ts            # 文化检测类型
│   └── taste.types.ts              # TASTE 类型（共享）
│
├── utils/
│   ├── dialogue-manager.ts         # 对话流程管理
│   ├── llm-prompt-builder.ts       # LLM 提示构建
│   └── taste-merger.ts             # TASTE 合并（预留）
│
├── __tests__/
│   ├── fixtures/
│   │   ├── dialogue-fixtures.ts
│   │   ├── session-fixtures.ts
│   │   └── analysis-fixtures.ts
│   ├── culture-session-service.test.ts
│   ├── culture-detection-service.test.ts
│   ├── taste-draft-builder.test.ts
│   └── culture-detection-e2e.test.ts
│
└── hooks/
    └── use-culture-detection.ts    # React Hook

data/taste/users/{userId}/
└── profile.json                     # User TASTE 存储位置
```

---

## 📅 时间表（10 工作日）

| Day | 任务 | 负责人 | 输出 |
|-----|------|--------|------|
| D1 | 创建基础文件结构 + 类型定义 | Developer | files, types |
| D2 | CultureSessionService 实现 | Developer | session service |
| D3 | CultureDetectionService + LLM 集成 | Developer | detection service |
| D4 | TasteDraftBuilder 实现 | Developer | draft builder |
| D5 | API 端点实现 | Developer | 4 个 endpoints |
| D6 | React Hook + 前端集成 | Developer | hook, UI integration |
| D7 | 单元测试编写 | Developer + QA | unit tests |
| D8 | 集成测试编写 | Developer + QA | integration tests |
| D9 | Bug 修复 + 优化 | Developer | fixes, optimizations |
| D10 | 验收 + 文档 | Developer + QA | acceptance report |

---

## 🧪 测试计划

详见: `docs/specs/epic-C/test-plan-story-c.1.md`

### 测试覆盖（总计 ~130 用例）

| 类型 | 用例数 | 优先级 |
|-----|-------|--------|
| 单元测试 | ~95 | P0 |
| 集成测试 | ~27 | P0 |
| 性能测试 | ~8 | P1 |

### 质量门

```
┌─────────────────────────────────────────────────────────────┐
│                    C.1 Quality Gate                          │
├─────────────────────────────────────────────────────────────┤
│  单元测试覆盖率: ≥ 80%                                       │
│  关键路径覆盖率: 100%                                        │
│                                                             │
│  性能指标:                                                    │
│  ├─ LLM 分析: P95 < 5s    🟢 待验证                          │
│  ├─ API 响应: P95 < 1s    🟢 待验证                          │
│  └─ TASTE 生成: < 200ms   🟢 待验证                          │
│                                                             │
│  功能验收:                                                    │
│  ├─ Schema 验证: 100% 通过 🟢 待验证                         │
│  ├─ E2E 流程: 3-5 轮完成   🟢 待验证                         │
│  └─ 人工验证: 准确率 > 60% 🟢 待验证                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 架构预留

### 两层架构支持

虽然 Phase 1 只实现 User TASTE，但所有设计都为 Project TASTE 预留了空间：

| 组件 | User TASTE | Project TASTE | 备注 |
|------|-----------|---------------|------|
| Schema | ✅ 实现 | 🔲 预留字段 | metadata.source |
| Storage | ✅ 实现 | 🔲 预留路径 | data/taste/projects/ |
| LLM Prompt | ✅ 实现 | 🔲 预留变种 | extractProjectTaste() |
| API | ✅ 实现 | 🔲 预留路由 | /api/taste/project/... |
| 融合逻辑 | 🔲 预留 | 🔲 Phase 1.5 | mergeTASTE() 框架 |

### pi-agent 集成预留

```typescript
// Phase 1: 仅 User TASTE
class TasteLoader {
  async loadTASTE(context: Context): Promise<TASTEProfile> {
    if (!context.projectId) {
      return await this.loadUserTASTE(context.userId);
    }
    // Phase 1.5: 实现两层融合
  }
}
```

---

## 📊 依赖关系

### 前置依赖

| 依赖 | 来源 | 状态 |
|-----|-----|------|
| pi-agent-core | Epic 0 | ✅ Complete |
| CUI | Epic 0 | ✅ Complete |
| 工具调用系统 | Epic 0 | ✅ Complete |

### 内部依赖

```
C.1 实现
├── CultureSessionService
│   └── 依赖：文件存储
├── CultureDetectionService
│   └── 依赖：pi-agent LLM 能力
├── TasteDraftBuilder
│   └── 依赖：LLM 输出格式
└── API 端点
    └── 依赖：所有服务的集成
```

### 后续影响

| 后续任务 | 影响 |
|---------|-----|
| C.5 (Phase 1.5) | 复用 LLM Prompt 结构，扩展 Project TASTE |
| C.2-C.3 (Phase 2) | 依赖两层 TASTE 融合逻辑 |
| C.4 (Power User) | 复用数据结构和 UI 组件 |

---

## 📚 参考文档

- Epic C README: `docs/specs/epic-C/README.md`
- Phase 1 PRD: `docs/product/phase-1-cognitive-features.md`
- 测试计划: `docs/specs/epic-C/test-plan-story-c.1.md`

---

## 🎯 下一步行动

### 立即开始（D1）
1. 创建基础文件结构
2. 定义类型（culture.types.ts, taste.types.ts）
3. 设置测试框架

### 本周目标（D1-5）
1. 完成 3 个核心服务实现
2. 完成 4 个 API 端点
3. 完成 React Hook

### 下周目标（D6-10）
1. 完成测试编写
2. 通过所有验收标准
3. 完成文档

---

**状态:** Ready for Development
**开始日期:** PM 批准后
**预计完成:** 10 工作日后
