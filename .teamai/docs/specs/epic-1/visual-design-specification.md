# 视觉设计规范 - Epic 1: 项目访谈

**版本:** 1.0
**项目:** OriginOS
**最后更新:** 2026-03-02

---

## 🎨 品牌视觉系统

### 品牌标识设计

#### Logo 设计

**概念：**「神经网络连接」

OriginOS 的 Logo 应该体现"AI Native"和"认知连接"的核心理念。采用神经网络节点与连接线的视觉隐喻，象征知识与智能的流动。

**Logo 结构：**

```
        ○──────○──────○
       /│\    /│\    /│\
      / │ │  / │ │  / │ │
     ○──○──○   ○──○──○
    / │ │ │   │ │ │ │ │ \
   ○──○──○──○──○──○──○──○
      \ │ │   \ │ │   \ │ /
       ○──○────○──○────○──○
```

**Logo 颜色规范：**
- 背景色：透明（支持深色/浅色背景）
- 节点：青色 `#00D9FF`（外圈）+ 粉紫 `#B794F6`（内核）
- 连接线：灰色 `#4B5563`（未激活）或 青色 `#00D9FF`（激活）
- 发光效果：外发光 `rgba(0, 217, 255, 0.3)`（呼吸动画）

---

### Logo SVG 代码

**完整版 Logo（用于欢迎界面）：**

```xml
<svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <!-- 定义渐变 -->
  <defs>
    <radialGradient id="nodeGradient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#B794F6"/>
      <stop offset="100%" stop-color="#00D9FF"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- 节点 1 (顶部) -->
  <circle cx="60" cy="30" r="8" fill="url(#nodeGradient)" filter="url(#glow)">

  <!-- 节点 2 (左侧) -->
  <circle cx="30" cy="60" r="8" fill="url(#nodeGradient)" filter="url(#glow)">

  <!-- 节点 3 (右侧) -->
  <circle cx="90" cy="60" r="8" fill="url(#nodeGradient)" filter="url(#glow)">

  <!-- 节点 4 (底部 central) -->
  <circle cx="60" cy="90" r="8" fill="url(#nodeGradient)" filter="url(#glow)">

  <!-- 连接线 -->
  <line x1="60" y1="38" x2="60" y2="52" stroke="#00D9FF" stroke-width="2" opacity="0.6"/>
  <line x1="38" y1="60" x2="52" y2="60" stroke="#00D9FF" stroke-width="2" opacity="0.6"/>
  <line x1="68" y1="60" x2="82" y2="60" stroke="#00D9FF" stroke-width="2" opacity="0.6"/>
  <line x1="38" y1="68" x2="50" y2="82" stroke="#00D9FF" stroke-width="2" opacity="0.6"/>
  <line x1="82" y1="68" x2="70" y2="82" stroke="#00D9FF" stroke-width="2" opacity="0.6"/>
  <line x1="63" y1="55" x2="35" y2="55" stroke="#00D9FF" stroke-width="2" opacity="0.4"/>
  <line x1="57" y1="55" x2="85" y2="55" stroke="#00D9FF" stroke-width="2" opacity="0.4"/>
  <line x1="60" y1="38" x2="85" y2="55" stroke="#00D9FF" stroke-width="2" opacity="0.4"/>
  <line x1="60" y1="38" x2="35" y2="55" stroke="#00D9FF" stroke-width="2" opacity="0.4"/>

  <!-- 呼吸动画外圈 -->
  <circle cx="60" cy="60" r="45" fill="none" stroke="#00D9FF" stroke-width="1" opacity="0.2">
    <animate attributeName="r" values="45;50;45" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.2;0.1;0.2" dur="3s" repeatCount="indefinite"/>
  </circle>
</svg>
```

**图标版 Logo（用于窗口标题栏、按钮等）：**

简化为 16px / 24px / 32px 版本，保留核心节点结构，去除动画效果。

---

## 🎯 进度指示器设计

### 步骤进度点

**视觉规范：**

| 状态 | 图形 | 尺寸 | 颜色 | 动画 |
|------|------|------|------|------|
| 未访问 | `○` 空心圆 | 12px | `#4B5563` | 无 |
| 当前 | `●` 实心圆 | 16px | `#00D9FF` | 脉动放大 |
| 已完成 | `✓` 实心圆 | 12px | `#00D9FF` | 无 |

**连接线：**
- 未激活段：灰色 `#4B5563`，线条宽度 2px
- 激活段：青色 `#00D9FF`，线条宽度 3px
- 动画：进度切换时 150ms 颜色过渡

---

## 🔘 按钮设计规范

### 按钮类型

| 按钮类型 | 尺寸 | 背景颜色 | 文字颜色 | 边框 | 阴影 |
|---------|------|---------|---------|------|------|
| Primary | 180×48px | `#00D9FF` | `#0A1929` | 无 | glow |
| Secondary | 120×48px | 透明 | `#9CA3AF` | `#4B5563` 虚线 | 无 |
| Tertiary | 120×48px | 透明 | `#9CA3AF` | 无 | 无 |
| Small | 100×32px | 透明 | `#9CA3AF` | 无 | 无 |
| Previous | 140×40px | 透明边框 | `#9CA3AF` | `#374151` | 无 |
| Next | 140×40px | `#00D9FF` | `#0A1929` | 无 | glow |
| Complete | 160×40px | `#00D9FF` | `#0A1929` | 无 | glow |

### 按钮状态

| 状态 | Primary | Secondary | Tertiary |
|------|---------|-----------|----------|
| 正常 | `#00D9FF` 背景 | 透明，虚线边框 | 透明 |
| Hover | 亮度 +10% | 边框变 `#00D9FF` | 文字变 `#E5E7EB` |
| 点击 | 缩小至 95% | 同 hover | 同 hover |
| 禁用 | 透明度 50% | 透明度 40% | 透明度 40% |

---

## 📝 输入框设计规范

### 文本输入框

**样式规范：**

```css
/* 默认状态 */
.textarea-interview {
  background: #0F141F;
  border: 1px solid #374151;
  border-radius: 8px;
  color: #E5E7EB;
  font-size: 14px;
  line-height: 1.5;
  padding: 16px 12px;
  min-height: 120px;
  max-height: 240px;
  resize: vertical;
  transition: all 150ms ease;
}

/* 聚焦状态 */
.textarea-interview:focus {
  outline: none;
  border-color: #00D9FF;
  box-shadow: 0 0 0 3px rgba(0, 217, 255, 0.2);
}

/* 错误状态 */
.textarea-interview.error {
  border-color: #EF4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

/* 占位符 */
.textarea-interview::placeholder {
  color: #6B7280;
}
```

---

## 🗂️ 图标系统

### 图标样式

| 图标类型 | 图标 | 用途 | 颜色 |
|---------|------|------|------|
| Navigation | Chevron Left | 上一步 | `#9CA3AF` |
| Navigation | Chevron Right | 下一步 | `#0A1929` |
| Action | Check | 完成/已访问 | `#00D9FF` |
| Action | X | 关闭/取消 | `#9CA3AF` |
| Action | Rotate | 加载中 | `#00D9FF` |
| Info | Info | 提示信息 | `#9CA3AF` |
| Warning | Alert | 警告 | `#F59E0B` |
| Error | Error | 错误 | `#EF4444` |

---

## 🎭 动画设计规范

### 滑入/滑出动画

**欢迎面板滑入：**
- 方向：从底部向上
- 持续时间：300ms
- 缓动函数：ease-out
- transform: translateY(100%) → translateY(0)
- 遮罩 opacity: 0 → 0.8

**访谈面板滑入：**
- 方向：从右侧
- 持续时间：300ms
- 缓动函数：ease-out
- transform: translateX(100%) → translateX(0)

### 步骤切换动画

**前进（步骤 1 → 2）：**
- 当前内容：translateX(0) → translateX(-100%), opacity 1 → 0.5
- 新内容：translateX(100%) → translateX(0), opacity 0.5 → 1
- 持续时间：250ms
- 缓动函数：ease-out

**后退（步骤 2 → 1）：**
- 当前内容：translateX(0) → translateX(100%)
- 新内容：translateX(-100%) → translateX(0)
- 持续时间：250ms
- 缓动函数：ease-out

---

## 📐 界面布局规范

### 欢迎面板布局

```
┌────────────────────────────────────┐
│                                    │
│         [Logo 64×64px]             │
│                                    │
│        欢迎使用 OriginOS            │
│    [AI Native 操作系统...]         │
│                                    │
│  • 项目访谈快速建模                │
│  • 本体图谱可视化                  │
│  • 自然对话交互                    │
│                                    │
│                                    │
│  [开始访谈]  [跳过]  [稍后问问]    │
│                                    │
└────────────────────────────────────┘
宽度: 560px
高度: 约 480px
内边距: 48px (上/下), 40px (左/右)
```

### 访谈面板布局

```
┌────────────────────────────────────┐
│  访谈                    [取消][×] │  ← 标题栏高 48px
├────────────────────────────────────┤
│                                    │
│  ●──○──○                           │  ← 进度高度 40px
│  步骤 1 / 3                         │
│                                    │
│  你的工作领域是什么？               │  ← 问题
│                                    │
│  [ℹ️ 提示: 例如...]                │  ← 提示框高 40px
│                                    │
│  ┌────────────────────────────┐    │
│  │                            │    │
│  │  [多行输入框 120px]       │    │
│  │                            │    │
│  └────────────────────────────┘    │
│                                    │
│       [上一步]           [下一步]   │  ← 按钮区域
│                                    │
└────────────────────────────────────┘
宽度: 600px (桌面)
高度: 自适应/最小 400px
```

---

## 🌈 颜色规范

### 品牌色

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| Primary | `#00D9FF` | 主按钮、进度指示、焦点 |
| Primary Dark | `#00A8CC` | Primary 的暗色变体（hover） |
| Secondary | `#B794F6` | 辅助强调、连接线渐变 |
| Background | `#0A1929` | 主背景 |
| Card Background | `#1A1F2E` | 卡片/面板背景 |
| Card Background Dark | `#0F141F` | 输入框等深色卡片 |

### 文本色

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| Text Primary | `#E5E7EB` | 主要文本 |
| Text Secondary | `#9CA3AF` | 次要文本、说明文字 |
| Text Tertiary | `#6B7280` | 占位符、禁用文本 |
| Text on Primary | `#0A1929` | 主按钮文字 |

### 功能色

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| Success | `#10B981` | 成功提示 |
| Warning | `#F59E0B` | 警告提示、跳过状态 |
| Error | `#EF4444` | 错误提示、验证失败 |
| Info | `#3B82F6` | 信息提示 |
| Border Default | `#374151` | 默认边框 |
| Border Active | `#00D9FF` | 激活/焦点边框 |
| Border Error | `#EF4444` | 错误状态边框 |

---

## ✏️ 字体规范

### 字体栈

```css
/* 英文/数字 */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* 中文 */
font-family: 'PingFang SC', 'Source Han Sans CN', '思源黑体', -apple-system, sans-serif;

/* 代码/等宽 */
font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
```

### 字体层级

| 层级 | 大小 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| H1 | 32px | 700 | 1.2 | 欢迎标题 |
| H2 | 24px | 600 | 1.3 | 问题标题、卡片标题 |
| H3 | 20px | 600 | 1.4 | 小节标题 |
| Body Large | 16px | 400 | 1.6 | 欢迎副标题、按钮文字 |
| Body | 14px | 400 | 1.6 | 提示文本、说明文字 |
| Caption | 12px | 400 | 1.5 | 标签、状态文字 |
| Code | 14px | 400 | 1.5 | 代码文本 |

---

## 📦 组件库设计

### 组件依赖

| 组件 | shadcn/ui 基础 | 自定义修改 |
|------|--------------|-----------|
| Dialog | Dialog | 自定义动画、背景色 |
| Button | Button | 自定义颜色、发光效果 |
| Input | Input/Textarea | 自定义背景、边框颜色 |
| Progress | Progress | 自定义点进度样式 |
| AlertDialog | AlertDialog | 自定义确认 dialogs |
| Badge | Badge | 自定义状态标签 |

---

## 📎 设计资源

### Figma 组件库

- 主文件：`OriginOS Design System`
- 图标库：基于 Fluent Icons
- 颜色 swatch：集成到 Figma 颜色面板
- 组件 templates：欢迎面板、访谈面板、进度指示器

### 导出选项

| 格式 | 用途 | 路径 |
|------|------|------|
| SVG | Logo、图标 | `/public/icons/` |
| PNG | 使用文档 | `/docs/assets/images/` |
| CSS | 样式变量 | `/src/styles/` |

---

## 🔍 设计审查

### 审查清单

- [x] 品牌视觉系统完整
- [x] Logo 设计符合品牌理念
- [x] 颜色系统符合 UX 规范
- [x] 字体系统清晰可读
- [x] 组件规范可实施
- [x] 动画性能已优化
- [x] 符合 AGENTS.md 规约

---

**变更历史：**
| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-03-02 | 初始版本 | product-designer |
