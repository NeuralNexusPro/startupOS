# 交互设计文档 - Story 1.3

**Story:** 1.3 - 初始本体结构生成
**版本:** 1.0
**最后更新:** 2026-03-02

---

## 🎨 设计概览

### 设计目标

通过流畅的动画和简洁的交互，让用户直观地理解生成的本体结构，并提供简单的编辑能力。

### 设计原则

1. **可视化优先** - 用动画展示本体生成过程
2. **简洁编辑** - 只提供核心编辑功能
3. **即时反馈** - 操作后立即更新视觉效果
4. **Wow Moment** - 节点生长动画带来愉悦感

---

## 🖼️ 界面设计

### 本体预览面板布局

```
┌─────────────────────────────────────────────────────────────┐
│  本体预览                              [取消保存] [×]      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    ●────────────●                                            │
│    │   工作领域   │   ← 领域层节点 (中心，呼吸动画)         │
│    ●────────────●                                            │
│      │      │                                                 │
│      │      ●──────●                                         │
│      │      │ 工作模式│  ← 概念对象节点                    │
│      │      ●──────●                                         │
│      │                                                       │
│  ●──────●                                                   │
│  │ 主要任务  │      ← 概念对象节点                          │
│  ●──────●                                                   │
│  │  │                                                         │
│  ○  ○       ← 可展开子节点（未展开）                        │
│                                                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    [编辑模式]  [确认使用]                    │
└─────────────────────────────────────────────────────────────┘
```

### 节点层级定义

```
Ontology
├── 领域层 (Domain)
│   ├── 概念对象 (Entity)
│   │   ├── 类 (Class)
│   │   └── 属性 (Property)
│   └── 关系 (Relationship)
```

---

## 🎬 动画规格

### 节点生长动画

**效果：** 中心节点出现 → 连接线辐射 → 子节点逐个生长

| 阶段 | 时长 | 内容 | 缓动 |
|------|------|------|------|
| 中心节点 | 150ms | 透明度 0→1，scale 0→1 | ease-out |
| 辐射连接 | 250ms | 连线从中心向外延伸 | cubic-bezier(0.4, 0, 0.2, 1) |
| 子节点 | 500ms | 子节点逐个出现（stagger 50ms） | cubic-bezier(0.4, 0, 0.2, 1) |

**代码示例：**
```css
@keyframes node-grow {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  60% {
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes line-draw {
  0% { stroke-dashoffset: 100%; }
  100% { stroke-dashoffset: 0; }
}
```

### 呼吸动画

**效果：** 节点周期性亮度和大小变化，突出重要节点

| 属性 | 值 |
|------|-----|
| 时长 | 2000ms |
| 透明度 | 0.7 ↔ 1.0 |
| 缩放 | 1.0 ↔ 1.02 |
| 缓动 | ease-in-out |
| 次数 | 无限循环 |

```css
@keyframes breathe {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(0, 217, 255, 0.2);
  }
  50% {
    opacity: 1;
    transform: scale(1.02);
    box-shadow: 0 0 16px 4px rgba(0, 217, 255, 0.4);
  }
}
```

### 连线流体动画

**效果：** 连线上的光点流动，表示关系活跃

| 属性 | 值 |
|------|-----|
| 时长 | 300ms |
| 距离 | 连线长度 |
| 缓动 | ease-in-out |
| 次数 | 循环流动 |

```css
@keyframes flow {
  0% { offset-distance: 0%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}
```

---

## 🔄 交互状态

### 状态 1: Generating (生成中)

**描述：** 完成访谈后，显示生成等待界面

**界面表现：**
- 旋转加载动画
- 进度条：0% → 100%
- 消息："正在分析您的访谈数据..." → "生成完成"

### 状态 2: Preview (预览)

**描述：** 显示完整的本体结构

**界面表现：**
- 树形结构展开
- 中心节点呼吸动画
- 所有节点生长动画完成
- "编辑模式" 和 "确认使用" 按钮可用

### 状态 3: Editing (编辑中)

**描述：** 用户正在编辑本体

**界面表现：**
- 进入编辑模式
- 节点悬停显示操作菜单
- 顶部显示编辑工具栏（重命名、删除、添加）

### 状态 4: Confirming (确认中)

**描述：** 点击确认后的短暂状态

**界面表现：**
- 确认按钮禁用
- 显示确认加载
- 成功动画（400ms）

### 状态 5: Success (成功)

**描述：** 本体保存成功

**界面表现：**
- 成功图标动画（✓）
- "本体已保存" 提示
- 自动跳转到主界面

---

## 📐 组件清单

### OntologyTree (本体树组件)

```typescript
interface OntologyTreeProps {
  /** 本体数据 */
  ontology: OntologyModel;
  /** 节点点击回调 */
  onNodeClick?: (node: OntologyNode) => void;
  /** 节点重命名回调 */
  onNodeRename?: (nodeId: string, newName: string) => void;
  /** 节点删除回调 */
  onNodeDelete?: (nodeId: string) => void;
  /** 添加节点回调 */
  onAddNode?: (parentId: string) => void;
  /** 是否可编辑 */
  editable?: boolean;
  /** 动画延迟 */
  animationDelay?: number;
}

interface OntologyNodeProps {
  /** 节点数据 */
  node: OntologyNode;
  /** 节点层级 */
  level: number;
  /** 是否展开 */
  expanded?: boolean;
  /** 是否可编辑 */
  editable?: boolean;
  /** 动画延迟 */
  animationDelay?: number;
  /** 点击回调 */
  onClick?: () => void;
  /** 重命名回调 */
  onRename?: (newName: string) => void;
  /** 删除回调 */
  onDelete?: () => void;
}
```

### TreePath (树形连接线)

- 使用 SVG 动态绘制连接线
- 支持流体动画效果
- 视觉样式：青色 #00D9FF，2px 宽度

---

## ⚡ 动画完整定义

```css
/* 节点生长动画 */
@keyframes node-grow {
  0% { opacity: 0; transform: scale(0); }
  60% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

/* 节点出现动画 */
@keyframes node-appear {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 呼吸动画 */
@keyframes breathe {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(0, 217, 255, 0.2);
  }
  50% {
    opacity: 1;
    transform: scale(1.02);
    box-shadow: 0 0 16px 4px rgba(0, 217, 255, 0.4);
  }
}

/* 连线绘制动画 */
@keyframes line-draw {
  0% { stroke-dashoffset: 100%; }
  100% { stroke-dashoffset: 0; }
}

/* 流体动画 */
@keyframes flow {
  0% { offset-distance: 0%; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}

/* 成功动画 */
@keyframes success-check {
  0% { stroke-dashoffset: 100; opacity: 0; }
  50% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes success-scale {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* 节点展开动画 */
@keyframes node-expand {
  0% { max-height: 0; opacity: 0; }
  100% { max-height: 500px; opacity: 1; }
}
```

---

## ♿ 可访问性设计

### 键盘导航

| 按键 | 功能 |
|------|------|
| Tab | 在节点间导航 |
| Enter | 展开/折叠节点 |
| Space | 选中节点 |
| Delete | 删除节点（编辑模式） |
| F2 | 重命名节点 |
| Escape | 退出编辑模式 |

### ARIA 标签

```html
<div
  role="tree"
  aria-label="本体结构树"
>
  <div
    role="treeitem"
    aria-expanded={expanded}
    aria-level={level}
    aria-label={node.name}
  >
    {node.name}
  </div>
</div>
```

---

## 📝 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-03-02 | 初始版本，定义 6 种动画和 5 种交互状态 | team-lead |
