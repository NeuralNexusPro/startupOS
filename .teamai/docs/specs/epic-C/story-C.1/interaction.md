# Story C.1: Onboarding UI/UX 设计文档

**Story 编号:** C.1
**文档版本:** 1.0.0
**创建日期:** 2026-03-11
**负责人:** UX Designer

---

## 1. 设计概述

### 1.1 设计目标

用户首次使用 OriginOS 时，系统需要通过自然对话了解用户的编码风格。这是一个 Onboarding 流程，核心设计目标是让用户感到舒适而不是"被测试"。

### 1.2 核心原则

1. **自然对话体验** - 像 AI 助手对话，而非问卷调查
2. **舒适感设计** - 避免直接询问"你编码风格是什么?"
3. **渐进式信息收集** - 通过情境化问题隐性提取品味信号
4. **透明反馈** - 进度可见，完成后有明确的确认

---

## 2. 用户流程

### 2.1 整体流程图

```
[首次启动 OriginOS]
        |
        v
[欢迎界面] (1.5秒)
        |
        v
[对话界面] ─── 3-5 轮对话 ───> [分析中]
        |                            |
        |                            v
        |                     [生成 TASTE]
        |                            |
        +<───────────────────────────+
        |
        v
[完成界面] ─── [进入系统]
```

### 2.2 状态机

```
┌─────────────┐
│   welcome   │ 初始状态, 显示欢迎动画
└─────┬───────┘
      │ 1.5s delay
      v
┌─────────────┐
│conversation │ 用户与 AI 对话
└─────┬───────┘
      │ maxTurns reached
      v
┌─────────────┐
│  analyzing  │ LLM 分析中, 显示加载动画
└─────┬───────┘
      │ analysis complete
      v
┌─────────────┐
│  complete   │ 显示完成界面和 TASTE 预览
└─────────────┘
```

---

## 3. 组件设计

### 3.1 UserTasteDetection (容器组件)

**文件:** `src/components/taste/UserTasteDetection.tsx`

**职责:**
- 管理检测会话生命周期
- 协调对话界面和完成界面
- 处理 API 调用和状态管理
- 提供关闭确认机制

**Props:**

```typescript
interface UserTasteDetectionProps {
  userId: string;           // 用户 ID
  projectId?: string;       // 项目 ID (Phase 1.5)
  maxTurns?: number;        // 最大对话轮数 (默认 3)
  isOpen: boolean;          // 是否显示
  onClose: () => void;      // 关闭回调
  onComplete?: (profile: TASTEProfile) => void;  // 完成回调
  apiBaseUrl?: string;      // API 基础路径
}
```

**视觉设计:**

```
┌─────────────────────────────────────────────────────────────┐
│  [O] 品味检测                              [X]              │  Header
│      让我了解一下你的工作方式                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     [Content Area]                          │  Body
│                  (TasteConversation 或                      │
│                   TasteComplete)                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     [Footer Actions]                        │  Footer
└─────────────────────────────────────────────────────────────┘
```

**关键交互:**

1. **ESC 关闭** - 按 ESC 键关闭对话框
2. **点击遮罩关闭** - 点击对话框外部区域触发关闭
3. **关闭确认** - 对话进行中关闭时显示确认对话框
4. **过渡动画** - 使用 Fluent 动画系统的淡入淡出效果

### 3.2 TasteConversation (对话界面)

**文件:** `src/components/taste/TasteConversation.tsx`

**职责:**
- 显示对话消息列表
- 用户输入框
- 进度指示器
- 发送按钮
- 消息气泡动画

**Props:**

```typescript
interface TasteConversationProps {
  messages: CultureDetectionMessage[];  // 对话消息列表
  currentTurn: number;                  // 当前轮次
  maxTurns: number;                     // 最大轮次
  isLoading: boolean;                   // 是否正在加载
  error: string | null;                 // 错误信息
  onSendMessage: (content: string) => void;  // 发送消息回调
}
```

**视觉设计:**

```
┌─────────────────────────────────────────────────────────────┐
│ 对话进度                                         1 / 3      │  Progress
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [O] 你好! 欢迎来到 OriginOS。                               │  AI Message
│      在开始之前, 我想了解一下你平时的工作方式...              │
│                                                             │
│                              我主要做前端开发 ──────── [U]   │  User Message
│                                                             │
│  [O] 很好! 你在做前端开发时, 最看重什么?                     │  AI Message
│                                                             │
│  [typing indicator]                                         │  Loading
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [输入你的回答...                              ] [发送 →]    │  Input Area
│                    按 Enter 发送消息                        │
└─────────────────────────────────────────────────────────────┘
```

**消息气泡设计:**

| 类型 | 背景 | 文字颜色 | 圆角 | 对齐 |
|------|------|----------|------|------|
| AI 消息 | gray-100 / gray-800/50 | gray-900 / white | 16px, 左上角直角 | 左对齐 |
| 用户消息 | gradient blue-purple | white | 16px, 右上角直角 | 右对齐 |

**动画:**

- 消息出现: 淡入 + 上移 10px (0.3s ease-out)
- 打字指示器: 弹跳动画 (0.6s 循环)
- 进度条: 宽度过渡 (0.5s ease)

### 3.3 TasteComplete (完成界面)

**文件:** `src/components/taste/TasteComplete.tsx`

**职责:**
- 显示品味检测完成信息
- TASTE Profile 预览 (可选展开)
- 进入主系统按钮
- 编辑/重新检测选项

**Props:**

```typescript
interface TasteCompleteProps {
  tasteProfile: TASTEProfile;     // 生成的 TASTE Profile
  onComplete: () => void;         // 完成按钮点击回调
  showDetails?: boolean;          // 是否显示详细预览
}
```

**视觉设计:**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     [✓ 成功图标]                            │  Success Icon
│                                                             │
│             太棒了! 我了解你的风格了                         │  Title
│                                                             │
│       通过我们的对话, 我已经创建了你的个人品味档案。          │  Description
│         这将帮助我更好地为你服务。                           │
│                                                             │
│                    置信度 75%                                │  Confidence
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏅 经验领域                                              │ │
│ │ [前端开发] [代码评审] [架构设计]                         │ │  Profile Card
│ │                                                          │ │
│ │ ❤️ 品味标准                                              │ │
│ │ 开发: + 简洁 + 可维护性                                  │ │
│ │                                                          │ │
│ │ [查看完整档案 ▼]                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     [────────── 进入 OriginOS ──────────]                   │  Action Button
│                                                             │
│        你随时可以在设置中更新你的品味档案                    │  Hint
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**展开详情视图:**

```
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ...                                                      │ │
│ │ [收起详情 ▲]                                             │ │
│ │ ─────────────────────────────────────────────────────── │ │
│ │ 张力位置                                                  │ │
│ │ ┌───────┐ ┌───────┐ ┌───────┐                           │ │
│ │ │ 控制  │ │ 信任  │ │ 介入  │                           │ │
│ │ │  60%  │ │  50%  │ │  70%  │                           │ │
│ │ └───────┘ └───────┘ └───────┘                           │ │
│ │                                                          │ │
│ │ 共生边界                                                  │ │
│ │ 委托领域: 代码生成, 测试                                  │ │
│ │ 保留领域: 架构决策                                        │ │
│ │                                                          │ │
│ │ 档案版本: 1.0.0                                          │ │
│ │ 创建时间: 2026-03-11 10:30:00                            │ │
│ └─────────────────────────────────────────────────────────┘ │
```

---

## 4. 视觉规范

### 4.1 颜色系统

使用 OriginOS 设计系统颜色:

| 用途 | Light Mode | Dark Mode |
|------|------------|-----------|
| 背景 | white/72% opacity | gray-800/72% opacity |
| 主色 | blue-500 | blue-400 |
| 强调 | purple-600 | purple-400 |
| 成功 | green-400 ~ emerald-600 | green-400 ~ emerald-600 |
| 文字 (主) | gray-900 | white |
| 文字 (次) | gray-600 | gray-400 |
| 文字 (提示) | gray-500 | gray-500 |
| 边框 | white/50% | white/18% |
| 遮罩 | black/40% | black/40% |

### 4.2 字体规范

| 元素 | 字号 | 字重 | 行高 |
|------|------|------|------|
| 标题 | 20px | 600 (semibold) | 1.5 |
| 副标题 | 14px | 400 | 1.5 |
| 正文 | 14px | 400 | 1.6 |
| 按钮 | 14px | 500 (medium) | 1.5 |
| 小文字 | 12px | 400 | 1.4 |

### 4.3 间距规范

| 元素 | 间距 |
|------|------|
| 容器内边距 | 24px (px-6, py-6) |
| 消息气泡间距 | 16px (space-y-4) |
| 气泡内边距 | 12px 16px (px-4, py-3) |
| 按钮内边距 | 12px 24px (py-3, px-6) |
| 区块间距 | 16px (mb-4) |

### 4.4 圆角规范

| 元素 | 圆角 |
|------|------|
| 对话框 | 12px (rounded-xl) |
| 消息气泡 | 16px (rounded-2xl) |
| 按钮 | 12px (rounded-xl) |
| 标签 | 9999px (rounded-full) |
| 输入框 | 12px (rounded-xl) |

---

## 5. 动画规范

### 5.1 动画时长

```typescript
const durations = {
  instant: 100,  // 瞬时反馈
  fast: 200,     // 快速过渡
  normal: 300,   // 标准动画
  slow: 500,     // 慢速动画
  enter: 250,    // 进入动画
  exit: 200,     // 退出动画
  complex: 400,  // 复杂动画
};
```

### 5.2 缓动函数

```typescript
const easings = {
  standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',    // 标准缓动
  decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',  // 减速缓动 (进入)
  accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',    // 加速缓动 (退出)
  sharp: 'cubic-bezier(0.4, 0.0, 0.6, 1)',       // 锐利缓动
};
```

### 5.3 关键动画

| 动画 | 时长 | 缓动 | 说明 |
|------|------|------|------|
| 对话框出现 | 300ms | decelerate | 淡入 + 缩放 95% -> 100% |
| 对话框消失 | 200ms | accelerate | 淡出 + 缩放 100% -> 95% |
| 消息出现 | 300ms | decelerate | 淡入 + 上移 10px |
| 进度条填充 | 500ms | standard | 宽度过渡 |
| 成功图标出现 | 400ms | elastic | 缩放弹性动画 |
| 详情展开/收起 | 300ms | standard | 高度过渡 |

---

## 6. 响应式设计

### 6.1 断点

| 断点 | 宽度 | 对话框宽度 |
|------|------|-----------|
| Mobile | < 640px | 全宽减 32px |
| Tablet | 640px - 1024px | max-w-xl |
| Desktop | > 1024px | max-w-2xl |

### 6.2 移动端适配

- 输入框全宽
- 按钮改为图标模式
- 消息气泡最大宽度 85%
- 简化详情预览

---

## 7. 无障碍 (A11y)

### 7.1 键盘导航

| 按键 | 功能 |
|------|------|
| Tab | 焦点在可交互元素间移动 |
| Enter | 发送消息 (输入框聚焦时) |
| Escape | 关闭对话框 |

### 7.2 ARIA 属性

```jsx
// 对话框
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">

// 进度条
<div role="progressbar" aria-valuenow={currentTurn} aria-valuemin={0} aria-valuemax={maxTurns}>

// 消息列表
<div role="log" aria-live="polite" aria-label="对话历史">

// 输入框
<input aria-label="输入你的回答" />

// 发送按钮
<button aria-label="发送消息" aria-disabled={isLoading}>
```

### 7.3 颜色对比度

- 主文字与背景: 对比度 >= 4.5:1
- 次文字与背景: 对比度 >= 3:1
- 焦点环: 明显的轮廓线

---

## 8. 组件使用示例

### 8.1 基础用法

```tsx
import { UserTasteDetection } from '@/components/taste';

function App() {
  const [isOpen, setIsOpen] = useState(true);

  const handleComplete = (profile: TASTEProfile) => {
    console.log('TASTE Profile:', profile);
    // 保存到全局状态或发送到服务器
  };

  return (
    <UserTasteDetection
      userId="user-123"
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onComplete={handleComplete}
      maxTurns={3}
    />
  );
}
```

### 8.2 与 API 集成

```tsx
import { UserTasteDetection } from '@/components/taste';
import { useAuth } from '@/hooks/useAuth';

function OnboardingFlow() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(!user.hasCompletedTaste);

  const handleComplete = async (profile: TASTEProfile) => {
    // 保存到服务器
    await fetch('/api/taste/user/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    // 更新用户状态
    updateUser({ hasCompletedTaste: true });
  };

  return (
    <UserTasteDetection
      userId={user.id}
      isOpen={showOnboarding}
      onClose={() => setShowOnboarding(false)}
      onComplete={handleComplete}
    />
  );
}
```

---

## 9. 设计决策

### 9.1 为什么选择对话式 Onboarding?

1. **自然交互** - 用户习惯了与 AI 对话，这种方式比问卷调查更自然
2. **隐性提取** - 通过情境化问题可以提取更真实的品味信号
3. **可扩展** - 可以根据用户回答动态调整后续问题
4. **用户友好** - 用户不会感到被"测试"，而是在"介绍自己"

### 9.2 为什么默认 3 轮对话?

1. **效率** - 3 轮对话可以在 2-3 分钟内完成
2. **质量** - 3 轮对话足以提取基本的品味信号
3. **可配置** - maxTurns 参数可以调整为 3-5 轮
4. **用户耐心** - 更多的轮次可能导致用户流失

### 9.3 为什么使用 Acrylic 材质?

1. **品牌一致性** - 与 OriginOS 整体视觉风格一致
2. **视觉层次** - 半透明效果创建层次感
3. **现代感** - 符合 macOS/Windows 11 设计趋势
4. **沉浸式** - 背景模糊让用户专注于对话

---

## 10. 文件清单

| 文件 | 描述 |
|------|------|
| `src/components/taste/UserTasteDetection.tsx` | 检测会话容器组件 |
| `src/components/taste/TasteConversation.tsx` | 对话界面组件 |
| `src/components/taste/TasteComplete.tsx` | 完成界面组件 |
| `src/components/taste/index.ts` | 组件导出索引 |
| `docs/specs/epic-C/story-C.1/ux-design.md` | 本设计文档 |

---

## 11. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|-----|---------|-------|
| 2026-03-11 | 1.0.0 | 初始版本 - 完整 UI/UX 设计文档 | UX Designer |

---

## 12. 相关文档

- [Story C.1 README](./README.md)
- [Story C.1 API 设计](./api-design.md)
- [TASTE 类型定义](../../../src/types/taste.ts)
- [Acrylic 组件文档](../../../src/components/os/acrylic/)
- [Fluent 动画系统](../../../src/lib/animations/)
