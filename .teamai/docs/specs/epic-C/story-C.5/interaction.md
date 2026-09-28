# Story C.5: 项目创建访谈 UX 设计文档

**Story 编号:** C.5
**文档版本:** 1.0.0
**创建日期:** 2026-03-12
**负责人:** UX Designer
**状态:** Draft

---

## 1. 设计概述

### 1.1 设计目标

当用户创建新项目时，系统通过自然访谈了解项目背景、目标和工作方式，同时**隐形采集** Project TASTE 并构建初始 Ontology。用户仅感知"项目创建访谈"，不感知任何"品味设置"。

### 1.2 核心原则

| 原则 | 描述 | 设计策略 |
|------|------|----------|
| **隐形采集** | 用户不感知 TASTE 存在 | 所有问题围绕"项目"而非"品味" |
| **自然访谈** | 像与同事讨论项目 | 情境化问题，避免抽象 |
| **双产出** | 项目信息 + TASTE + Ontology | 后台处理，用户无感知 |
| **渐进引导** | 逐步深入，不一次性轰炸 | 4 步完成，每步 1 个核心问题 |
| **尊重时间** | 可跳过，可稍后补充 | 提供"稍后完善"选项 |

### 1.3 设计挑战

1. **如何隐形采集 TASTE？**
   - 用户回答"项目做什么" → 提取 Experience Topology
   - 用户回答"最重要是什么" → 提取 Taste Standards
   - 用户回答"工作模式" → 提取 Symbiosis Boundary
   - 用户回答"业务领域" → 构建 Ontology

2. **如何让访谈不感觉冗长？**
   - 每步仅 1 个核心问题
   - 提供预设选项 + 自定义
   - 支持"跳过"或"稍后"
   - 进度可视

3. **如何平衡简洁与完整？**
   - 核心问题必须问（4 个）
   - 追问可选触发
   - 完成后可补充

---

## 2. 用户流程

### 2.1 整体流程图

```
[点击"创建新项目"]
        |
        v
[项目创建访谈] ─── Step 1: 项目背景 ───> [隐性提取: Experience Topology]
        |                    |
        v                    v
[Step 2: 核心目标] ──────────────> [隐性提取: Taste Standards + Tension Position]
        |
        v
[Step 3: 工作模式] ──────────────> [隐性提取: Symbiosis Boundary]
        |
        v
[Step 4: 确认创建] ──────────────> [后台: Project TASTE + Ontology 生成]
        |
        v
[项目创建成功] ─── [进入项目工作区]
```

### 2.2 状态机

```
┌─────────────┐
│    idle     │ 初始状态
└─────┬───────┘
      │ start project creation
      v
┌─────────────┐
│   step_1    │ 项目背景
└─────┬───────┘
      │ next
      v
┌─────────────┐
│   step_2    │ 核心目标
└─────┬───────┘
      │ next
      v
┌─────────────┐
│   step_3    │ 工作模式
└─────┬───────┘
      │ next
      v
┌─────────────┐
│   step_4    │ 确认创建
└─────┬───────┘
      │ confirm
      v
┌─────────────┐
│  creating   │ 创建项目中... (后台: TASTE + Ontology)
└─────┬───────┘
      │ complete
      v
┌─────────────┐
│   success   │ 创建成功
└─────────────┘
```

### 2.3 跳过与稍后流程

```
[任意步骤]
      |
      ├─── [跳过] ───> 跳到下一步 / 确认页
      |                    |
      |                    v
      |              使用默认值填充 TASTE
      |
      └─── [稍后完善] ───> 跳过访谈，创建最小项目
                               |
                               v
                        标记项目为"待完善"
```

---

## 3. 访谈流程设计

### 3.1 Step 1: 项目背景

**用户感知：** 了解项目做什么

**隐性采集：** Experience Topology

**界面设计：**

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建访谈                                     步骤 1 / 4   │
│  ━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  这个项目主要是做什么的？                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │  给电商网站做库存管理系统，实时追踪商品入库出库...            ││
│  │                                                             ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  💡 自然描述即可，比如：产品类型、使用的技术、解决的问题...      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      [跳过此步]                              [下一步 →]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**用户回答类型与隐性提取：**

| 回答类型 | 示例回答 | 隐性提取 (Experience Topology) |
|---------|---------|-------------------------------|
| 技术细节型 | "用 Next.js + TypeScript 做一个 API 服务..." | `["web-development", "api-design", "typescript"]` |
| 业务目标型 | "帮助用户快速管理库存，减少缺货..." | `["inventory-management", "ecommerce", "automation"]` |
| 问题导向型 | "现在的库存系统太慢了，经常报错..." | `["performance-optimization", "error-handling"]` |
| 团队协作型 | "我们团队需要一个协作工具来..." | `["team-collaboration", "project-management"]` |

**后台处理示例：**

```json
{
  "experience_topology": ["web-development", "api-design", "typescript"],
  "context_features": {
    "domain": "ecommerce/inventory-management",
    "task_type": "backend-integration",
    "environment": "nextjs-typescript-stack",
    "discourse_system": "technical"
  }
}
```

---

### 3.2 Step 2: 核心目标

**用户感知：** 了解项目优先级

**隐性采集：** Taste Standards + Tension Position

**界面设计：**

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建访谈                                     步骤 2 / 4   │
│  ━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  这个项目最重要的是什么？                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ✓ 快速上线                                                 ││
│  │    先把功能做出来，后续再优化                                ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 稳定可靠                                                 ││
│  │    代码质量高，减少 bug 和维护成本                           ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 易于维护                                                 ││
│  │    结构清晰，方便后续扩展和团队协作                          ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 其他（自定义描述）                                       ││
│  │    [输入你的优先级...]                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  💡 可以多选，但建议选最核心的 1-2 个                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      [← 上一步]    [跳过此步]              [下一步 →]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**选项与隐性提取映射：**

| 用户选择 | Taste Standards | Tension Position |
|---------|----------------|------------------|
| 快速上线 | `positive_vibes: ["velocity", "iteration-speed"]` | `intervention_threshold: low` |
| 稳定可靠 | `positive_vibes: ["predictability", "error-absence"]` | `intervention_threshold: high` |
| 易于维护 | `positive_vibes: ["clean-structure", "documentation"]` | `depth_preference: high` |
| 自定义描述 | 触发追问 → 进一步提取 | 根据描述推断 |

**追问机制（触发条件：选择"其他"）：**

```
┌─────────────────────────────────────────────────────────────────┐
│  追问                                                            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  你提到"[用户输入的内容]"，能具体说说这对你意味着什么吗？        │
│                                                                 │
│  比如：什么样的结果让你觉得"这就对了"？                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [输入...]                                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│              [跳过追问]    [确认]                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.3 Step 3: 工作模式

**用户感知：** 了解团队协作方式

**隐性采集：** Symbiosis Boundary

**界面设计：**

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建访谈                                     步骤 3 / 4   │
│  ━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  你希望怎么使用这个项目？                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 我自己开发和维护                                         ││
│  │    全程自己掌控，AI 辅助具体任务                             ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 和小团队一起协作                                         ││
│  │    团队成员共同贡献，AI 帮助协调                             ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 交给其他人使用，我只负责需求                              ││
│  │    我是产品角色，AI 帮我实现想法                             ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ○ 其他模式                                                 ││
│  │    [描述你的工作模式...]                                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      [← 上一步]    [跳过此步]              [下一步 →]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**选项与共生边界推断：**

| 用户选择 | Symbiosis Boundary | Control Level |
|---------|-------------------|---------------|
| 自己开发维护 | `delegated_domains: [], reserved_domains: ["all"]` | 0.9 |
| 小团队协作 | `delegated_domains: ["document-generation", "code-formatting"]` | 0.5 |
| 只负责需求 | `delegated_domains: ["implementation", "testing"]` | 0.3 |
| 其他模式 | 根据描述推断 | 自定义 |

**后台处理示例：**

```json
{
  "symbiosis_boundary": {
    "delegated_domains": ["document-generation", "code-formatting"],
    "reserved_domains": ["architecture-decisions", "database-schema"],
    "contextual_triggers": [],
    "control_level": 0.5
  }
}
```

---

### 3.4 Step 4: 确认创建

**用户感知：** 确认项目信息

**后台处理：** 生成 Project TASTE + Ontology

**界面设计：**

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建访谈                                     步骤 4 / 4   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  项目信息确认                                                    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  项目名称                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  库存管理系统                                               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  项目类型                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  电商 / 库存管理                                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  核心目标                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ✓ 快速上线                                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  工作模式                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  小团队协作                                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ℹ️ 系统将根据以上信息自动配置项目环境和智能辅助设置         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│      [← 修改信息]                         [创建项目 →]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**创建中状态：**

```
┌─────────────────────────────────────────────────────────────────┐
│  创建项目中...                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     [Loading Spinner]                           │
│                                                                 │
│              正在创建项目结构...                                 │
│              这可能需要几秒钟                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ✓ 项目文件夹创建完成                                       ││
│  │  ✓ 初始配置已生成                                           ││
│  │  ○ 智能辅助配置中...                                        ││  ← 用户感知
│  │  ○ 项目看板准备中...                                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  （后台实际执行：生成 Project TASTE + 构建 Ontology）           │  ← 用户不可见
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**成功状态：**

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建成功！                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     [✓ Success Icon]                            │
│                                                                 │
│              项目 "库存管理系统" 已创建成功！                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  项目路径: /projects/inventory-system                       ││
│  │  配置文件: 已生成                                           ││
│  │  智能辅助: 已配置                                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  💡 你可以随时在项目设置中调整这些配置                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│              [进入项目]         [稍后设置]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件设计

### 4.1 ProjectCreationWizard (容器组件)

**文件:** `src/components/project/ProjectCreationWizard.tsx`

**职责:**
- 管理访谈步骤状态
- 协调各步骤界面
- 处理 API 调用（项目创建 + TASTE 生成）
- 提供步骤导航

**Props:**

```typescript
interface ProjectCreationWizardProps {
  isOpen: boolean;                              // 是否显示
  onClose: () => void;                          // 关闭回调
  onComplete?: (project: Project) => void;      // 完成回调
  apiBaseUrl?: string;                          // API 基础路径
  defaultValues?: Partial<ProjectCreationData>; // 默认值
}

interface ProjectCreationData {
  name: string;                    // 项目名称
  background: string;              // Step 1: 项目背景
  priorities: string[];            // Step 2: 核心目标
  workMode: WorkMode;              // Step 3: 工作模式
  customDescription?: string;      // 自定义描述
}

type WorkMode = 'solo' | 'team' | 'product-owner' | 'custom';
```

**状态管理:**

```typescript
interface WizardState {
  currentStep: 1 | 2 | 3 | 4;           // 当前步骤
  stepData: {
    1: { background: string };
    2: { priorities: string[]; customPriority?: string };
    3: { workMode: WorkMode; customWorkMode?: string };
    4: { name: string; confirmed: boolean };
  };
  isCreating: boolean;                   // 创建中
  error: string | null;                  // 错误
  project: Project | null;               // 创建的项目
}
```

### 4.2 StepComponents (步骤组件)

**文件:** `src/components/project/wizard/`

```
wizard/
├── StepBackground.tsx      // Step 1: 项目背景
├── StepPriorities.tsx      // Step 2: 核心目标
├── StepWorkMode.tsx        // Step 3: 工作模式
├── StepConfirm.tsx         // Step 4: 确认创建
├── CreatingState.tsx       // 创建中状态
├── SuccessState.tsx        // 成功状态
└── index.ts                // 组件导出
```

#### 4.2.1 StepBackground (Step 1)

```typescript
interface StepBackgroundProps {
  value: string;                  // 当前输入值
  onChange: (value: string) => void;
  onNext: () => void;
  onSkip: () => void;
  placeholder?: string;
}
```

**特性:**
- 多行文本输入
- 实时字数统计
- 智能建议（基于用户历史）
- Enter 快捷提交

#### 4.2.2 StepPriorities (Step 2)

```typescript
interface StepPrioritiesProps {
  selected: string[];             // 已选择优先级
  customValue?: string;           // 自定义描述
  onChange: (selected: string[], custom?: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// 预设优先级选项
const PRIORITY_OPTIONS = [
  { value: 'velocity', label: '快速上线', description: '先把功能做出来，后续再优化' },
  { value: 'stability', label: '稳定可靠', description: '代码质量高，减少 bug 和维护成本' },
  { value: 'maintainability', label: '易于维护', description: '结构清晰，方便后续扩展和团队协作' },
  { value: 'custom', label: '其他', description: '自定义你的优先级' },
] as const;
```

**特性:**
- 多选卡片
- 自定义输入联动
- 建议选择最多 2 个

#### 4.2.3 StepWorkMode (Step 3)

```typescript
interface StepWorkModeProps {
  value: WorkMode;                // 当前选择
  customValue?: string;           // 自定义描述
  onChange: (value: WorkMode, custom?: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// 工作模式选项
const WORK_MODE_OPTIONS = [
  { value: 'solo', label: '我自己开发和维护', icon: '👤', description: '全程自己掌控，AI 辅助具体任务' },
  { value: 'team', label: '和小团队一起协作', icon: '👥', description: '团队成员共同贡献，AI 帮助协调' },
  { value: 'product-owner', label: '交给其他人使用', icon: '🎯', description: '我是产品角色，AI 帮我实现想法' },
  { value: 'custom', label: '其他模式', icon: '⚙️' },
] as const;
```

**特性:**
- 单选卡片
- 图标辅助
- 自定义描述

#### 4.2.4 StepConfirm (Step 4)

```typescript
interface StepConfirmProps {
  data: ProjectCreationData;      // 所有步骤数据
  onConfirm: () => void;
  onBack: () => void;
  onEdit: (step: number) => void; // 返回编辑某步
}
```

**特性:**
- 信息摘要展示
- 可编辑字段
- 创建确认

---

## 5. 视觉规范

### 5.1 颜色系统

使用 OriginOS 设计系统，与 C.1 Onboarding 保持一致：

| 用途 | Light Mode | Dark Mode |
|------|------------|-----------|
| 对话框背景 | white/72% opacity | gray-800/72% opacity |
| 步骤指示器 | blue-500 | blue-400 |
| 选中卡片 | blue-50 / blue-900/20 | blue-900/30 |
| 卡片边框 | gray-200 | gray-700 |
| 主要按钮 | blue-500 | blue-400 |
| 文字 (主) | gray-900 | white |
| 文字 (次) | gray-600 | gray-400 |

### 5.2 步骤指示器设计

```
┌─────────────────────────────────────────────────────────────────┐
│  项目创建访谈                                     步骤 2 / 4   │
│  ━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ─────────────────────────────────────────────────────────────  │
│  │ 步骤指示器细节 │                                             │
│  ─────────────────────────────────────────────────────────────  │
│  ●━━━●━━━○━━━○                                                 │
│  1   2   3   4                                                  │
│                                                                 │
│  ● 已完成 (blue-500 filled)                                     │
│  ● 当前步骤 (blue-500 filled + label)                           │
│  ○ 未完成 (gray-300 outlined)                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 卡片选择样式

**未选中:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ○ 快速上线                                                    │
│    先把功能做出来，后续再优化                                   │
│  ─────────────────────────────────────────────────────────────  │
│  border: 1px solid gray-200                                     │
│  background: transparent                                        │
│  hover: border: blue-300, background: blue-50                   │
└─────────────────────────────────────────────────────────────────┘
```

**选中:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ✓ 快速上线                                                    │
│    先把功能做出来，后续再优化                                   │
│  ─────────────────────────────────────────────────────────────  │
│  border: 2px solid blue-500                                     │
│  background: blue-50                                            │
│  check icon: blue-500                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 字体规范

| 元素 | 字号 | 字重 | 行高 |
|------|------|------|------|
| 标题 | 20px | 600 (semibold) | 1.5 |
| 步骤指示 | 14px | 500 (medium) | 1.5 |
| 问题文字 | 16px | 500 (medium) | 1.6 |
| 卡片标题 | 14px | 500 (medium) | 1.5 |
| 卡片描述 | 12px | 400 | 1.4 |
| 按钮 | 14px | 500 (medium) | 1.5 |
| 提示文字 | 12px | 400 | 1.4 |

### 5.5 间距规范

| 元素 | 间距 |
|------|------|
| 对话框内边距 | 24px (px-6, py-6) |
| 步骤间距 | 32px (mb-8) |
| 卡片间距 | 12px (space-y-3) |
| 卡片内边距 | 16px (px-4, py-3) |
| 按钮内边距 | 12px 24px (py-3, px-6) |
| 按钮组间距 | 12px (space-x-3) |

---

## 6. 动画规范

### 6.1 步骤切换动画

| 动画 | 时长 | 缓动 | 说明 |
|------|------|------|------|
| 步骤进入 | 300ms | decelerate | 淡入 + 右滑 20px |
| 步骤退出 | 200ms | accelerate | 淡出 + 左滑 20px |
| 进度条填充 | 500ms | standard | 宽度过渡 |
| 卡片选中 | 200ms | standard | 边框 + 背景 |

### 6.2 微交互

| 元素 | 动画 | 触发 |
|------|------|------|
| 卡片 hover | 边框颜色 + 背景色 | 鼠标移入 |
| 复选框 | 缩放弹性 | 点击 |
| 成功图标 | 弹跳 + 淡入 | 出现 |
| Loading | 旋转 | 创建中 |

---

## 7. 隐性提取设计

### 7.1 提取映射表

| 用户输入 | 隐性提取维度 | 提取方法 |
|---------|-------------|----------|
| 项目背景描述 | Experience Topology | NLP 关键词 + 领域识别 |
| 项目背景描述 | Context Features | 技术栈识别 + 任务类型推断 |
| 核心目标选择 | Taste Standards | 预设映射 + 自定义解析 |
| 核心目标选择 | Tension Position | 阈值推断 |
| 工作模式选择 | Symbiosis Boundary | 预设映射 |
| 工作模式选择 | Control Level | 数值推断 |
| 自定义描述 | 所有维度 | LLM 分析 |

### 7.2 LLM Prompt 设计

**Step 1 分析 Prompt:**

```
分析用户对项目背景的描述，提取以下信息：

用户输入: "{user_input}"

请提取：
1. 领域 (domain): 项目所属的业务/技术领域
2. 任务类型 (task_type): 主要任务类型
3. 技术栈 (tech_stack): 提到的技术
4. 话语体系 (discourse_system): technical/business/mixed

返回 JSON 格式：
{
  "domain": "string",
  "task_type": "string",
  "tech_stack": ["string"],
  "discourse_system": "technical" | "business" | "mixed",
  "experience_topology": ["string"]
}
```

**Step 2 分析 Prompt:**

```
根据用户选择的核心目标，推断品味标准和张力位置：

用户选择: {selected_priorities}
自定义描述: {custom_description}

请推断：
1. Taste Standards: positive_vibes, negative_vibes
2. Tension Position: intervention_threshold, risk_tolerance

返回 JSON 格式：
{
  "taste_standards": {
    "{domain}": {
      "positive_vibes": ["string"],
      "negative_vibes": ["string"]
    }
  },
  "tension_position": {
    "intervention_threshold": 0.0-1.0,
    "risk_tolerance": 0.0-1.0
  }
}
```

**Step 3 分析 Prompt:**

```
根据用户选择的工作模式，推断共生边界：

用户选择: {work_mode}
自定义描述: {custom_description}

请推断：
1. Delegated Domains: 可委托给 AI 的任务领域
2. Reserved Domains: 用户保留决策权的领域
3. Control Level: 0.0-1.0

返回 JSON 格式：
{
  "symbiosis_boundary": {
    "delegated_domains": ["string"],
    "reserved_domains": ["string"],
    "contextual_triggers": [],
    "control_level": 0.0-1.0
  }
}
```

### 7.3 默认值设计

当用户跳过某步骤时，使用默认值：

```typescript
const DEFAULT_TASTE_VALUES = {
  // 跳过 Step 1
  experience_topology: ['general-development'],
  context_features: {
    domain: 'unknown',
    task_type: 'general',
    discourse_system: 'mixed'
  },

  // 跳过 Step 2
  taste_standards: {
    'general': {
      positive_vibes: ['clean-code', 'documentation'],
      negative_vibes: ['complexity', 'spaghetti-code']
    }
  },
  tension_position: {
    intervention_threshold: 0.5,
    risk_tolerance: 0.5
  },

  // 跳过 Step 3
  symbiosis_boundary: {
    delegated_domains: ['document-generation'],
    reserved_domains: ['architecture-decisions'],
    contextual_triggers: [],
    control_level: 0.5
  }
};
```

---

## 8. 响应式设计

### 8.1 断点

| 断点 | 宽度 | 对话框宽度 | 布局调整 |
|------|------|-----------|----------|
| Mobile | < 640px | 全宽减 24px | 单列卡片 |
| Tablet | 640px - 1024px | max-w-xl | 双列卡片 |
| Desktop | > 1024px | max-w-2xl | 双列卡片 |

### 8.2 移动端适配

- 步骤指示器简化为数字
- 卡片全宽
- 按钮固定在底部
- 简化描述文字
- 支持手势滑动切换步骤

---

## 9. 无障碍 (A11y)

### 9.1 键盘导航

| 按键 | 功能 |
|------|------|
| Tab | 焦点在可交互元素间移动 |
| Enter | 确认选择 / 下一步 |
| Escape | 关闭对话框 |
| Arrow Up/Down | 在选项间切换 |

### 9.2 ARIA 属性

```jsx
// 对话框
<div role="dialog" aria-modal="true" aria-labelledby="wizard-title">

// 步骤指示器
<nav aria-label="访谈进度">
  <ol role="list">
    <li aria-current="step">步骤 1</li>
  </ol>
</nav>

// 卡片选项
<div role="radiogroup" aria-label="核心目标">
  <div role="radio" aria-checked="true">快速上线</div>
</div>

// 进度条
<div role="progressbar" aria-valuenow={2} aria-valuemin={1} aria-valuemax={4}>
```

### 9.3 颜色对比度

- 主文字与背景: 对比度 >= 4.5:1
- 卡片选中状态: 明显的边框和背景变化
- 焦点环: 明显的轮廓线

---

## 10. 与 C.1 的设计一致性

### 10.1 共享组件

| 组件 | 用途 | 来源 |
|------|------|------|
| Acrylic Dialog | 模态对话框 | C.1 |
| Progress Bar | 进度指示 | C.1 |
| Message Bubble | 消息展示 | C.1 |
| Button | 操作按钮 | 设计系统 |
| Input | 文本输入 | 设计系统 |

### 10.2 视觉一致性

- 相同的 Acrylic 材质背景
- 相同的颜色系统
- 相同的动画时长和缓动
- 相同的圆角和间距

### 10.3 体验差异

| 方面 | C.1 Onboarding | C.5 项目创建 |
|------|----------------|-------------|
| 交互方式 | 对话式 | 表单式 |
| 问题风格 | 开放式对话 | 半结构化问答 |
| 用户感知 | "了解我的风格" | "创建项目" |
| 隐形程度 | 隐形但明确 | 完全隐形 |
| 完成时间 | 2-3 分钟 | 1-2 分钟 |

---

## 11. 组件使用示例

### 11.1 基础用法

```tsx
import { ProjectCreationWizard } from '@/components/project';

function ProjectsPage() {
  const [showWizard, setShowWizard] = useState(false);

  const handleComplete = (project: Project) => {
    console.log('Project created:', project);
    // 导航到项目页面
    router.push(`/projects/${project.id}`);
  };

  return (
    <>
      <Button onClick={() => setShowWizard(true)}>
        创建新项目
      </Button>

      <ProjectCreationWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleComplete}
      />
    </>
  );
}
```

### 11.2 带默认值

```tsx
<ProjectCreationWizard
  isOpen={showWizard}
  onClose={() => setShowWizard(false)}
  onComplete={handleComplete}
  defaultValues={{
    name: '我的项目',
    background: '这是一个示例项目...',
  }}
/>
```

### 11.3 与 API 集成

```tsx
import { useState } from 'react';
import { ProjectCreationWizard } from '@/components/project';
import { createProject } from '@/api/projects';

function CreateProjectButton() {
  const [showWizard, setShowWizard] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleComplete = async (data: ProjectCreationData) => {
    setIsCreating(true);
    try {
      const project = await createProject(data);
      // API 会自动处理 TASTE 生成和 Ontology 构建
      router.push(`/projects/${project.id}`);
    } catch (error) {
      // 错误处理
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ProjectCreationWizard
      isOpen={showWizard}
      onClose={() => setShowWizard(false)}
      onComplete={handleComplete}
    />
  );
}
```

---

## 12. 设计决策

### 12.1 为什么选择表单式而非对话式？

1. **任务导向** - 创建项目是明确的任务，用户期望结构化流程
2. **效率优先** - 表单式比对话式更快完成
3. **可见选项** - 用户可以看到所有选项，无需思考如何回答
4. **灵活性** - 支持跳过和稍后补充

### 12.2 为什么使用 4 步而非更少？

1. **信息完整性** - 4 步覆盖 Project TASTE 的 4 个维度
2. **渐进式** - 每步 1 个核心问题，不会让用户感到负担
3. **可跳过** - 支持跳过任意步骤
4. **时间可控** - 1-2 分钟完成，可接受

### 12.3 为什么隐藏 TASTE 概念？

1. **认知负担** - 用户不需要理解 TASTE 概念
2. **自然体验** - 用户感知只是在"创建项目"
3. **渐进揭示** - C.4 提供 Power User 入口
4. **核心价值** - TASTE 是手段，不是目的

---

## 13. 文件清单

| 文件 | 描述 |
|------|------|
| `src/components/project/ProjectCreationWizard.tsx` | 主容器组件 |
| `src/components/project/wizard/StepBackground.tsx` | Step 1 组件 |
| `src/components/project/wizard/StepPriorities.tsx` | Step 2 组件 |
| `src/components/project/wizard/StepWorkMode.tsx` | Step 3 组件 |
| `src/components/project/wizard/StepConfirm.tsx` | Step 4 组件 |
| `src/components/project/wizard/CreatingState.tsx` | 创建中状态 |
| `src/components/project/wizard/SuccessState.tsx` | 成功状态 |
| `src/components/project/wizard/index.ts` | 组件导出 |
| `src/lib/project/taste-extraction.ts` | 隐性提取逻辑 |
| `docs/specs/epic-C/story-C.5/ux-design.md` | 本设计文档 |

---

## 14. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|-----|---------|-------|
| 2026-03-12 | 1.0.0 | 初始版本 - 完整 UX 设计文档 | UX Designer |

---

## 15. 相关文档

- [Epic C README](../README.md)
- [Story C.5 README](./README.md)
- [Story C.1 UX 设计](../story-C.1/ux-design.md)
- [ux-design-c1-onboarding.md](../../../design/ux-design-c1-onboarding.md)
- [TASTE 类型定义](../../../../src/types/taste.ts)
