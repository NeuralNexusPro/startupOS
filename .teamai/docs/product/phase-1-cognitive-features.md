# Phase 1 产品需求文档：认知功能实现

**版本:** 2.0 ✅
**日期:** 2026-03-06
**范围:** 基于认知精髓的 3 个用户界面功能（渐进式方案 Option B）
**状态:** 已达成最终共识 - 等待 Team Lead 批准

---

## 📋 决策摘要

### 核心决策
**Option B (渐进式 + 架构准备)** 已批准为 Phase 1 策略。

### 三个关键约束

| 约束 | 确保方式 |
|-----|---------|
| 架构完整性 | 数据结构支持 Phase 3 完整 4 个维度 |
| 价值演示机制 | Phase 1 末期展示 Agent 行为差异 |
| 结晶化承诺 | 明确标注 Phase 3 会提供完整编辑器 |

### 技术发现

| 发现 | 影响 |
|-----|-----|
| PostgreSQL 未在代码库实现 | 使用文件 JSON (遵循现有 interview/ontology 模式) |
| Week 3-4 范围需调整 | 4 功能 → 3 功能 (延后隐式收集 + 完整测试) |

---

## 🗺️ 渐进式产品路径

```
Phase 1: Observer Mode (当前) - 本文档
  ├─ 对话式文化检测 → 抽取品味 → 生成 TASTE.md 草稿
  ├─ 行动确认 (张力位置显化)
  ├─ 信任学习 (Activity→Weights 结晶化)
  └─ 显式品味收集 (用户主动输入)

Phase 2: Local Loop (未来 3-6 个月)
  ├─ 隐性反馈："我注意到你喜欢 X"
  ├─ 用户验证或调整
  └─ 模式识别引擎 (隐式收集)

Phase 3: Ontology Crystallization (承诺 6-9 个月)
  ├─ 完整 4 维度显式编辑器
  ├─ 经验拓扑编辑器
  ├─ 品味标准编辑器
  ├─ 张力位置配置系统
  └─ 共生边界规则引擎
```

**这不是"简化"，这是符合认知框架本质的工程路径：**
- **Phase 1: Observer Mode** (Activity → Weights 起点)
- **Phase 2: Local Loop** (隐性反馈循环)
- **Phase 3: Ontology Crystallization** (完整显式控制)

---

## 🗣️ 用户传达策略 (PD 三层描述)

### Layer 1: Onboarding (Day 1)

**消息：**
```
OriginOS learns your coding style through conversation
→ Adapts suggestions to match your preferences
→ Gives you control over which actions it can take

Over time, as we work together, you'll see:
"I've learned that you prefer clean over clever"
Want to fine-tune? You can explicitly edit your style profile at any time.
```

**功能：** 文化检测

---

### Layer 2: Growth (Week 1-4)

**行动确认消息：**
```
Agent 要对代码进行格式化
将进行：统一引号、添加尾随分号

[取消]  [确认格式化]
```

**信任学习消息：**
```
我注意到你已连续 3 次确认"代码格式化"操作。

以后同类型操作是否：
⦿ 跳过确认，直接执行
⦿ 仍然每次确认

[确认我的选择]
```

---

### Layer 3: Growth (Week 4, 显式品味收集)

**消息：**
```
我已学习了 3 个模式：

你偏好：
• 简洁 > 聪明
• 显式 > 隐式
• 先写核心逻辑，再做格式化

[这些匹配我的理解吗？]
```

---

### Layer 4: Power User (Phase 3)

**消息：**
```
准备好深入定制你的品味配置了吗？

完整编辑器包括：
• Experience Topology: 具身感知领域
• Taste Standards: 对/扭曲感觉描述
• Tension Position: 控制与信任阈值
• Symbiosis Boundary: 委托与保留范围

[创建 TASTE Profile]
```

---

## 📊 功能清单 (Phase 1 最终范围)

| # | 功能名称 | 认知本质 | 用户价值 | 界面类型 | 调度 |
|---|---------|---------|---------|---------|-----|
| 1 | **文化检测** | 经验拓扑抽取 + 品味标准感受 | "系统了解我的风格" | 一次性对话页面 | Week 1-2 |
| 2 | **行动确认** | 张力位置显化 | "你可以控制" | 操作前弹窗 | Week 3, Days 1-3 |
| 3 | **信任学习** | Activity→Weights 结晶化 | "越用越懂你" | 操作后/阈值弹窗 | Week 3, Days 4-5 |
| 4 | **显式品味收集** | 品味标准感受 | "透明度" | 查看/编辑页面 | Week 4, Days 1-2 |

**延后到 Phase 2：**
- ❌ 隐性品味收集 (需复杂模式识别)
- ❌ 完整集成测试套件

---

## 🎯 功能 1：文化检测

### 认知精髓
**Activity → Weights 起点** - 系统通过对话观察用户的具身经验，建立初步品味权重

### 本质定义
基于 Team Lead 的 TASTE.md 修正：
- **经验拓扑**：具身直观感知领域
- **品味标准**：工作中"对/扭曲"的直接感知判断（无需推理）
- **隐性抽取**：通过对话自然收集，隐性提取品味标准

### 用户故事

> 作为一个新用户，我希望系统能通过自然对话理解我的编码风格，这样 Agent 的建议会更符合我的直觉判断。

### 功能需求

**输入方式：**
- 与 Agent 进行 3-5 轮自然对话
- 避免直接询问抽象问题（如"你喜欢什么风格？"）
- 通过引导性问题隐性提取品味线索

**分析维度 (LLM 抽取)：**

```typescript
interface CultureLayerDetection {
  result: {
    experience_topology: string[];      // 具身感知领域
    taste_standards: {
      [domain: string]: {
        positive_vibes: string[];       // "对"的感觉
        negative_vibes: string[];       // "扭曲"的感觉
      };
    };
    tension_position?: {
      control_level: number;            // 0-1
      trust_level: number;              // 0-1
      intervention_threshold: number;   // 0-1
    };
  };
}
```

**输出方式 (TASTE.md 草稿)：**

```
✅ 分析完成

你的品味档案已生成：

经验拓扑：
• 代码评审
• 架构设计
• 集成测试

品味标准：
在代码评审中：
  ✅ 喜欢的建设性：具体建议 + 解释原因
  ❌ 扭曲的：指出格式问题但忽略逻辑

张力位置：
控制度：60% (你希望在关键时刻保留决定权)

[继续使用 OriginOS]
```

### UX 方向

```
┌─────────────────────────────────────────────────────────────┐
│  让我们互相了解一下...                                         │
│                                                                     │
│  [动态对话区域 - 3-5 轮自然对话]                                    │
│                                                                     │
│  ──────────────────────────────────────────────────────────       │
│                                                                     │
│  ✅ 分析完成                                                          │
│                                                                     │
│  我发现你：                                                          │
│  "在代码评审中，我喜欢看到具体的逻辑建议，而非格式问题"              │
│                                                                     │
│  [继续使用 OriginOS]                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
```

### API 设计 (4 个端点)

```
POST /api/culture/detection/start
  → 开始检测会话

POST /api/culture/detection/:sessionId/message
  → 发送对话消息

POST /api/culture/detection/:sessionId/analyze
  → 触发 LLM 分析

GET /api/culture/detection/:sessionId/taste-draft
  → 获取 TASTE Profile 草稿
```

### 技术需求摘要

**存储：** 文件 JSON (遵循 `data/culture/` 和 `data/taste/` 模式)
**集成：** 现有 pi-agent 提供对话和 LLM 能力
**时间：** Week 1-2 (10 天开发)

---

## 🛡️ 功能 2：行动确认

### 认知精髓
**ECO 三元张力：张力位置显化** - 让用户在关键时刻保留介入权，体现 Human in the Loop

### 本质定义
基于 TASTE.md 的**张力位置**（Tension Position）：
- **介入时刻**（ Intervention Threshold）：Agent 操作需要用户确认的阈值
- **信任时刻**（Trust Threshold）：Agent 可以自动执行的操作范围

### 用户故事

> 作为用户，我希望 Agent 在执行影响代码的操作前需要我的确认，这样我可以保持对关键任务的控制权。

### 功能需求

**触发条件（基于 tension_position）：**

| 操作类型 | 当前 tension_position | 是否需要确认 |
|---------|---------------------|-------------|
| 代码格式化 | intervention_threshold: 0.5+ | ✅ 需要 |
| 文件修改 | intervention_threshold: 0.7+ | ✅ 需要 |
| 数据库变更 | intervention_threshold: 0.9+ | ✅ 永久需要 |

**确认流程：**

```
┌─────────────────────────────────────────────────────────────┐
│  确认操作                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                                     │
│  Agent 要对代码进行格式化                                          │
│                                                                     │
│  将进行以下操作：                                                  │
│  • 统一引号风格                                                      │
│  • 添加尾随分号                                                    │
│  • 调整代码缩进                                                    │
│                                                                     │
│  [取消]  [确认格式化]                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
```

**记忆用户选择：**
- 记录用户的确认/拒绝选择
- 用于信任学习询问功能
- 随着信任度提升，减少确认频率

### UX 简化原则（PD + UX Designer）

- ✅ **简化说明**：不显示技术细节（如具体代码行）
- ✅ **清晰按钮**：明确的"取消 / 确认"操作
- ✅ **一致性**：不同操作使用统一的确认弹窗样式

### 重检测机制

- 用户可以主动调整 tension_position 设置
- 系统在信任学习后会自动优化确认阈值

### 技术需求摘要

**实现方式：** 中间件拦截 Agent 操作 + 前端模态弹窗
**调度：** Week 3, Days 1-3 (3 天)
**依赖：** 文化检测生成的 tension_position 值

---

## 🧪 功能 3：信任学习

### 认知精髓
**Activity → Weights 结晶化** - 通过用户连续的确认行为，结晶出信任模式，简化交互

### 本质定义
基于 TASTE.md 的**共生边界**（Symbiosis Boundary）：
- **委托范围**（Delegated Domains）：哪些操作可以委托给系统
- **保留范围**（Reserved Domains）：哪些操作必须用户亲自决定
- **触发布局**（Contextual Triggers）：特定情境下强制确认

### 用户故事

> 作为用户，如果我已经多次确认同一类操作，我希望系统能询问我是否可以跳过确认，这样可以简化我的工作流程。

### 功能需求

**触发条件：**
- 用户连续 3 次确认同一类操作
- 例：连续 3 次确认"代码格式化"

**信任计数器可视化：**

```
┌─────────────────────────────────────────────────────────────┐
│  OriginOS          信任度: 3/10 [⚡警告]                        │
└─────────────────────────────────────────────────────────────┘
```

**询问流程 (连续 3 次确认后)：**

```
┌─────────────────────────────────────────────────────────────┐
│  信任学习                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                                     │
│  我注意到你已连续 3 次确认"代码格式化"操作：                          │
│                                                                     │
│  以后同类型操作是否：                                              │
│  ⦿ 跳过确认，直接执行                                               │
│  ○ 仍然每次确认                                                   │
│                                                                     │
│  [确认我的选择]                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
```

**记忆用户选择：**
- 如果选择"跳过确认"，记录用户信任该操作类型
- 更新 symbiosis_boundary 委托范围
- 如果选择"仍然每次确认"，保持现状

### 价值体现

- ✅ 让用户感觉被理解 ("系统知道我的习惯")
- ✅ 体现 Activity→Weights 认知精髓（习惯的形成）
- ✅ 给用户主动权（用户决定何时简化交互）

### 技术需求摘要

**跟踪机制：** 操作类型计数器 + 阈值触发
**调度：** Week 3, Days 4-5 (2 天)
**依赖：** 行动确认的记录数据

---

## 📝 功能 4：显式品味收集

### 认知精髓
**透明度** - 让用户看到系统记录了什么，保持对系统的了解和控制权

### 本质定义
基于 TASTE.md 的**品味标准**（Taste Standards）收集：
- **显式输入**：用户主动填写"我喜欢/我不喜欢"的列表
- **隐性抽取**：系统通过对话和使用自动抽取 (Phase 2)
- **未来扩展**：Phase 3 完整品味标准编辑器

### 用户故事

> 作为用户，我希望查看和补充我的品味偏好，这样我能确保系统正确理解我的风格，并保持对系统的控制权。

### 功能需求

**两列显示模式：**
- "我喜欢这样的" - 正向品味（Positive Vibes）
- "我不喜欢这样的" - 负向品味（Negative Vibes）

**基本操作：**
- 手动添加/编辑品味偏好
- 查看"系统已学习我的 X 个偏好"统计
- 支持文本格式描述
- 导出为 TASTE.md 草稿

**系统主动提示：**
- Agent 操作前可以显示相关偏好（如有）
- 例："我记得你喜欢先写核心逻辑再做格式化，是这样的吗？"

### UX 方向

```
┌─────────────────────────────────────────────────────────────┐
│  我的品味偏好                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                                     │
│  📊 系统已学习：3 个偏好                                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 我喜欢这样的                                              │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ • 先写核心逻辑，后做格式化                                │   │
│  │ • 显式优于隐式                                          │   │
│  │ • 可测试性优先                                          │   │
│  │                                                         │   │
│  │ [+ 添加偏好]                                            │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 我不喜欢这样的                                            │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ • 过度抽象                                              │   │
│  │ • 硬编码配置                                            │   │
│  │                                                         │   │
│  │ [+ 添加偏好]                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [导出为 TASTE.md 草稿]                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
```

### 技术需求摘要

**存储：** 文件 JSON (`data/taste/{projectId}/draft.json`)
**调度：** Week 4, Days 1-2 (2 天)
**扩展性：** 数据结构支持 Phase 3 完整编辑器

---

## 📋 Week 1-4 里程碑（更新范围）

### Week 1-2: Culture Detection + TASTE Draft

| 任务 | 角色 | 交付物 | 天数 |
|------|------|--------|-----|
| 文化会话服务 (`CultureSessionService`) | Developer | 对话轮次跟踪 | 1.5 |
| 检测服务 (`CultureDetectionService`) | Developer | LLM 集成 | 1.5 |
| 数据层 (文件 JSON) | Developer | `data/culture/` 和 `data/taste/` | 1.5 |
| API 层 | Developer | 4 个端点 | 2.5 |
| 测试 | Developer | 单元 + 集成测试 | 1 |
| 文化检测 UX 流程 | UX Designer | 对话界面 + 结果展示 | 2.5 |
| TASTE 预览界面 | UX Designer | 草稿展示 UI | 1.5 |

**Week 1-2 总计: 12 天** (10 天开发，2 天缓冲)

---

### Week 3: Action Confirmation + Trust Learning

| 任务 | 角色 | 交付物 | 调度 |
|------|------|--------|-----|
| 行动确认中间件 | Developer | 操作拦截逻辑 | Week 3, Day 1 |
| 行动确认 UI | UX Designer | 模态弹窗 (简化版) | Week 3, Day 2 |
| 行动确认集成 | Developer + UX | 端到端工作流 | Week 3, Day 3 |
| 信任计数器 | Developer | 操作类型计数 | Week 3, Day 4 |
| 信任学习询问 | Developer + UX | 阈值触发弹窗 | Week 3, Day 5 |

**Week 3 总计: 5 天** (符合原计划)

---

### Week 4: Explicit Taste Collection + Bug Fixes

| 任务 | 角色 | 交付物 | 调度 |
|------|------|--------|-----|
| 显式品味收集 UI | UX Designer | 两列输入表单 | Week 4, Day 1 |
| 品味收集数据流 | Developer | 保存/编辑/导出 | Week 4, Day 2 |
| 价值演示机制 | UX + Developer | Agent 差异展示 | Week 4, Day 3 |
| Bug 修复与优化 | Developer + QA | 问题修复 | Week 4, Day 4 |
| 测试与文档 | QA + PM | 测试报告 + 文档更新 | Week 4, Day 5 |

**Week 4 总计: 5 天** (符合原计划)

**延后到 Phase 2：**
- ❌ 隐性品味收集 (需模式识别引擎)
- ❌ 完整集成测试套件

---

## 📊 数据结构设计 (完整 4 维度)

### 存储方案：文件 JSON (遵循现有模式)

**原因：** PostgreSQL 未在代码库实现，文件 JSON 已用于 interviews 和 ontologies

```
data/
  culture/
    {sessionId}.json        // 文化检测会话
  taste/
    {projectId}/
      draft.json            // 最新 TASTE Profile 草稿
      history/
        {timestamp}.json    // 历史版本
```

---

### TASTE Profile Schema (支持 Phase 3)

```typescript
{
  version: "1.0.0",
  createdAt: "2026-03-06T10:10:00Z",
  updatedAt: "2026-03-06T10:15:00Z",
 projectId: "proj-xxx",
  sourceSessionId: "culture-xxx",
  data: {
    // ✅ 维度 1: 经验拓扑 (Week 1-2 填充)
    experience_topology: [
      "code-review",
      "architecture-design",
      "integration-testing"
    ],

    // ✅ 维度 2: 品味标准 (Week 1-2 对话抽取，Week 4 显式输入)
    taste_standards: {
      "code-review": {
        positive_vibes: [
          "constructive specific suggestions",
          "explanatory reasoning",
          "context-aware feedback"
        ],
        negative_vibes: [
          "nitpicking formatting",
          "ignoring logic for style",
          "dismissive tone"
        ]
      }
    },

    // ✅ 维度 3: 张力位置 (Week 3 填充，从简单滑块 → 完整配置)
    tension_position: {
      // Week 1-4: 简单值
      control_level: 0.6,
      trust_level: 0.5,
      intervention_threshold: 0.7,

      // Phase 3: 按域细分 (预留字段)
      // by_domain: {
      //   "code-formatting": { trust: 0.8, intervention: 0.6 },
      //   "database-migration": { trust: 0.3, intervention: 0.9 }
      // }
    },

    // ✅ 维度 4: 共生边界 (Week 3 填充，Phase 3 扩展)
    symbiosis_boundary: {
      // Week 3-4: 简单列表
      delegated_domains: ["code-generation", "documentation"],
      reserved_domains: ["security-reviews", "deployments"],
      contextual_triggers: ["critical-bug", "production-issue"],

      // Phase 3: 规则引擎 (预留字段)
      // rules: [
      //   { condition: "production", action: "require_confirmation" },
      //   { condition: "test_env", action: "auto_approve_if_trusted" }
      // ]
    },

    // 统计信息
    memory_stats: {
      total_memories: 3,
      high_confidence_count: 2,
      avg_confidence: 0.75,
      domains: ["software-development"]
    },

    // 信任分数
    trust_score: {
      successful_actions: 5,
      total_actions: 8,
      user_confirms: 3,
      user_denies: 2
    }
  }
}
```

**设计原则：**
- ✅ **递归兼容**：Phase 1 结构是 Phase 3 的子集，无需迁移
- ✅ **版本化**：`version` 字段支持未来演进
- ✅ **审计追踪**：`createdAt`, `updatedAt`, `sourceSessionId`

---

### 迁移策略 (Phase 2-3)

```
Phase 1: 文件 JSON (当前)
   ↓ 无迁移，直接追加字段

Phase 2: 添加 PostgreSQL 适配器 (可选)
   - JSON 文件 → PostgreSQL JSONB 同步
   - 支持复杂查询和实时搜索

Phase 3: Neo4j 图数据库 (可选)
   - 适用于：<10,000 品味记忆，多跳查询
   - 迁移脚本：JSON → PostgreSQL → Neo4j
```

---

## 🎯 Phase 3 结晶化承诺

### 明确承诺 (标注在产品文档中)

> **Phase 3 (承诺 6-9 个月内交付):**
>
> OriginOS 将提供完整的 TASTE.md 显式编辑器，包括：
>
> 1. **经验拓扑编辑器** - 可视化具身感知领域，支持领域聚合和细分
> 2. **品味标准编辑器** - 对/扭曲感觉的直接描述编辑器，无需推理
> 3. **张力位置配置系统** - 人/LLM/代码三方定位的细粒度配置
> 4. **共生边界规则引擎** - 委托/保留范围的规则化定义
>
> **该功能是明确承诺，不是"也许以后"。**

---

## 🎨 价值演示机制 (Phase 1 末期)

### 在 Week 4, Day 3 执行

**目的：** 让用户感知到 Agent 行为的差异，而非理解抽象概念

**展示流程：**

```
[用户完成 3 周使用后]

┌─────────────────────────────────────────────────────────────┐
│  我注意到的一些差异                                              │
├─────────────────────────────────────────────────────────────┤
│                                                                     │
│  因为学习了你的品味，我在以下操作中调整了建议：                       │
│                                                                     │
│  案例 1: 代码重构                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 无 TASTE.md: 建议大规模重构 + 新架构引入                  │   │
│  │ 有 TASTE.md: 建议小步骤重构 + 保持现有一致性                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                     │
│  结果：小步骤重构在 2 天内完成，保持团队一致性 ✅                      │
│                                                                     │
│  [这符合我的期望吗？]                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────┘
```

**设计原则：**
- ✅ **具体案例**：展示真实的情境对比
- ✅ **用户故事**：用用户熟悉的场景
- ✅ **可验证**：让用户能直接判断差异价值

---

## 🚦 成功标准 (更新)

### Phase 1 终点验收

| 指标 | 目标 |
|-----|-----|
| 文化检测可用 | 5 秒内返回 TASTE.md 草稿，准确率 > 60% |
| 行动确认可用 | 拦截成功率 > 90%，弹窗正确展示 |
| 信任学习可用 | 连续 3 次确认后询问触发，用户选择正确记录 |
| 品味收集可用 | 用户能添加/编辑至少 3 个偏好，导出功能正常 |
| 价值演示完成 | Week 4, Day 3 展示案例，用户理解差异价值 |

### 用户体验验收

| 维度 | 目标 | 认知精髓体现 |
|-----|-----|-------------|
| **用户感知** | 文化检测后感觉"系统了解我的风格" | Experience Topology 抽取 |
| **控制感** | 行动确认时感觉"我在控制" | Tension Position 显化 |
| **透明度** | 品味收集让用户看到"系统记了什么" | Taste Standards 可见 |
| **进化感** | 信任学习后感觉"越用越懂我" | Activity→Weights 结晶化 |

### 认知精髓验收

| 理论要求 | Phase 1 实现 | 状态 |
|---------|-------------|-----|
| Activity → Weights 起点 | 对话式抽取品味 | ✅ Week 1-2 |
| ECO 张力显化 | 行动确认 + 信任学习 | ✅ Week 3 |
| 透明度 | TASTE Profile + 价值演示 | ✅ Week 4 |
| Humam in the Loop | 所有操作可介入/撤销 | ✅ 所有功能 |
| 架构完整性 | 数据结构支持 Phase 3 | ✅ 全程 |

---

## 📊 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|-----|-----|---------|
| LLM 提示调整需 > 2 天 | Medium | Medium | 从 2 轮对话开始，Week 2 迭代 |
| Week 3-4 功能完不成 | Low | High | 已范围调整 (4→3 功能) |
| 用户理解抽象概念困难 | Medium | High | 采用 PD 三层 messaging，价值演示机制 |
| 文件 JSON 无法扩展 | Low | High | 已设计迁移架构 (Phase 2+ PostgreSQL) |

---

## ⏭️ 下一步: Team Lead 批准

### 本文档状态

- ✅ 产品方向: 已达成团队共识 (6/6 成员)
- ✅ 技术可行性: 已确认 (Architect + Developer)
- ✅ 产品化澄清: 已完成 (PD + UX)
- ⏳ **等待批准: Team Lead 决策后开始开发**

### 批准后立即行动

| 角色 | 任务 | 截止 |
|-----|-----|-----|
| Developer | Week 1-2: 文化检测实现 | 10 天 |
| UX Designer | Week 1-2: 对话界面 + 草稿 UI | 5 天 |
| Developer | Week 3: 行动确认 + 信任学习 | 5 天 |
| Developer + UX | Week 4: 品味收集 + 价值演示 | 5 天 |

### 需要批准的关键点

1. **Week 1-2 范围** - 文化检测 + TASTE 草稿生成 ✅
2. **Week 3-4 范围** - 3 功能 (行动确认 + 信任学习 + 显式收集) ✅
3. **存储方案** - 文件 JSON (遵循现有模式) ✅
4. **三层 messaging** - Onboarding → Growth → Power User ✅
5. **Phase 3 承诺** - 明确标注完整编辑器承诺 ✅

---

## 📄 相关文档

| 文档 | 位置 |
|-----|-----|
| Team Lead 决策 | `docs/product/team-lead-decision-phase1-option-b.md` |
| 技术可行性报告 | `docs/design/phase1-technical-feasibility-report.md` |
| 决策总结 | `docs/product/phase1-decision-summary.md` |
| TASTE.md 修正分析 | `docs/product/taste-md-corrected-understanding.md` |

---

**文档版本:** 2.0 ✅
**最后更新:** 2026-03-06
**状态:** 等待 Team Lead 批准 → 开发
