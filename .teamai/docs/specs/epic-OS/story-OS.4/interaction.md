# Story OS.4: Spotlight 全局命令 - 交互设计文档 (IDD)

**版本**: v1.0
**日期**: 2026-03-07
**状态**: 草稿
**批准状态**: 待批准

---

## 1. 设计概述

### 1.1 设计目标

创建流畅、直观的全局命令面板交互体验：
- 瞬时响应 - 打开/搜索 < 100ms
- 键盘优先 - 完整键盘操作
- 智能匹配 - 模糊搜索容错
- 视觉清晰 - 结果层次分明

### 1.2 设计原则

| 原则 | 实施 |
|-----|------|
| **即时响应** | 打开/搜索 < 100ms，动画 60fps |
| **键盘优先** | 完整键盘导航，无需鼠标 |
| **渐进披露** | 只显示相关信息 |
| **容错设计** | 模糊搜索，错别字容忍 |

### 1.3 设计参考

- **macOS Spotlight**: 经典全局命令体验
- **Raycast**: 现代化 UI 改进
- **CmdK**: React 实现参考

---

## 2. 交互流程

### 2.1 打开流程

```
用户按 Cmd+K / Ctrl+K
    ↓ [10ms]
快捷键监听触发
    ↓ [40ms]
打开动画开始
    ├─ transform: scale(0.95 → 1)
    ├─ opacity: 0 → 1
    └─ backdrop: blur(0 → 8px)
    ↓ [150ms]
Spotlight 完全打开
    ↓ [立即]
搜索框自动聚焦
    ↓
等待用户输入
```

### 2.2 搜索流程

```
等待用户输入
    ↓
键盘输入字符
    ↓ [去抖 150ms]
触发搜索
    ↓ [算法执行]
模糊匹配结果
    ↓ [排序]
结果排序 (匹配度 > 类型 > 使用频率)
    ↓ [20ms]
更新结果列表
    ├─ 结果项滑入 (staggered 0.05s)
    └─ 高亮匹配关键词
    ↓
等待下一个输入或操作
```

### 2.3 选择流程

```
用户按 ↓ 键
    ↓
选中下一项
    ├─ 当前项: 移除高亮
    └─ 下一项: 添加高亮 + 滚动到可见
    ↓ [动画 150ms]
高亮过渡
    ↓
等待操作或继续选择

用户按 Enter
    ↓
执行选中项 action()
    ↓
关闭 Spotlight
    ├─ 动画反向 (100ms)
    └─ 恢复之前焦点
    ↓
触发结果 (打开 App/Agent/命令)
```

### 2.4 关闭流程

```
用户按 Esc / Cmd+K / 点击外部
    ↓ [立即]
触发关闭
    ↓ [动画 100ms]
关闭动画
    ├─ transform: scale(1 → 0.95)
    ├─ opacity: 1 → 0
    └─ backdrop: blur(8px → 0)
    ↓
Spotlight 完全关闭
    ↓
恢复之前活跃元素焦点
```

---

## 3. 状态定义

### 3.1 Spotlight 状态机

```
          ┌──────────┐
          │  CLOSED  │ ◄──────────┐
          └────┬─────┘           │
               │ open()          │
               │ (Cmd+K)         │ close() / Esc
               ▼                 │
          ┌──────────┐           │
          │  OPENED  ├───────────┘
          └────┬─────┘
               │
      ┌────────┴────────┐
      │                 │
   isTyping         isSelected
      │                 │
      ▼                 ▼
   ┌───────┐        ┌──────┐
   │SEARCHING│      │SELECTED│
   └───────┘        └──────┘
      │                 │
      ├─────────────────┤
      │ close() / Enter│
      ▼                 ▼
   ┌─────────────────────────────┐
   │      OPENED (transition)    │
   └─────────────┬───────────────┘
                 │ closed()
                 ▼
          ┌──────────┐
          │  CLOSED  │
          └──────────┘
```

### 3.2 视觉状态

| 状态 | 描述 | 触发条件 |
|-----|------|----------|
| **闭包** | 面板隐藏 | 初始状态 |
| **打开中** | 缩放动画执行 | Cmd+K 触发 |
| **打开** | 面板可见 | 动画完成 |
| **搜索中** | 显示结果 | 用户输入 |
| **选中** | 高亮结果 | 键盘选择 |

---

## 4. 交互规范

### 4.1 键盘交互

| 按键 | 动作 | 说明 |
|-----|------|------|
| `Cmd/Ctrl + K` | 打开/关闭 | 全局快捷键 |
| `Esc` | 关闭 | 关闭面板 |
| `↑` | 选择上一项 | 方向导航 |
| `↓` | 选择下一项 | 方向导航 |
| `Enter` | 执行选中 | 执行当前项 |
| `Tab` | 切换焦点 | 预留 |

### 4.2 鼠标交互

| 手势 | 动作 | 反馈 |
|-----|------|------|
| hover 结果项 | 高亮 | 背景色变化 |
| click 结果项 | 执行 | 关闭面板 |
| click 外部 | 关闭 | 关闭面板 |
| click 关闭按钮 (x) | 关闭 | 关闭面板 |

### 4.3 触摸交互

| 手势 | 动作 | 说明 |
|-----|------|------|
| tap 结果项 | 执行 | 移动端交互 |

---

## 5. 视觉规范

### 5.1 布局

```
┌─────────────────────────────────────────────────┐
│  backdrop: blur(8px) rgba(0,0,0,0.4)          │
│  ┌─────────────────────────────────────────┐  │
│  │  🔍 Search...                    [x]   │  │ ← 搜索框
│  ├─────────────────────────────────────────┤  │
│  │  📄  Finder              ↵            │  │
│  ├─────────────────────────────────────────┤  │
│  │  💻  Developer Agent       ↵            │  │
│  ├─────────────────────────────────────────┤  │
│  │  ⚙️  Settings             ↵            │  │
│  ├─────────────────────────────────────────┤  │
│  │  🎨  UX Designer Agent    ↵            │  │
│  ├─────────────────────────────────────────┤  │
│  │  🔍 Search Commands...                 │  │
│  ├─────────────────────────────────────────┤  │
│  │  [ 5 results ]  ↑↓ navigate  ↵ select │  │ ← 底部提示
│  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 5.2 尺寸

| 元素 | 尺寸 | 说明 |
|-----|------|------|
| 最大宽度 | 600px | 水平居中 |
| 最小宽度 | 320px | 移动端 |
| 最大高度 | 480px | 内容区域 |
| 搜索框高度 | 44px | padding 12px |
| 结果项高度 | 44px | padding 12px |
| 圆角 | 12px | borderRadius |
| 边框 | 1px solid rgba(0,0,0,0.1) | 边框 |

### 5.3 颜色

| 元素 | 颜色 | 状态 |
|-----|------|------|
| 背景色 | rgba(255,255,255,0.95) | 默认 |
| 浅色模式 | #FFFFFF | 主题 |
| 深色模式 | #1F2937 | 主题 |
| 高亮 | #EBF5FF | 选中 |
| 选中边框 | rgba(59, 130, 246, 0.3) | 选中 |
| 文本主色 | #111827 | 默认 |
| 文本副色 | #6B7280 | 描述 |
| 阴影 | 0 10px 40px rgba(0,0,0,0.15) | 面板 |

### 5.4 动画

```css
/* 打开/关闭动画 */
.spotlight-enter {
  animation: spotlight-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes spotlight-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 选中高亮动画 */
.spotlight-item-selected {
  transition: all 150ms ease-out;
  background-color: #EBF5FF;
}

/* 结果项滑入动画 */
.spotlight-item-enter {
  animation: slide-in 0.2s ease-out forwards;
  opacity: 0;
  transform: translateY(8px);
}

@keyframes slide-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 5.5 缓动函数

| 动画 | 缓动函数 | 持续时间 |
|-----|----------|---------|
| 打开 | cubic-bezier(0.16, 1, 0.3, 1) | 150ms |
| 关闭 | cubic-bezier(0.36, 0, 0.66, -0.56) | 100ms |
| 选中 | ease-out | 150ms |
| 滑入 | ease-out | 0.2s |

---

## 6. 搜索交互

### 6.1 搜索去抖

```typescript
// 去抖 150ms
const debouncedSearch = debounce((query: string) => {
  performSearch(query);
}, 150);
```

### 6.2 结果排序

```
优先级: 匹配度 > 类型 > 使用频率

1. 精确匹配 (title === query)
2. 前缀匹配 (title.startsWith(query))
3. 模糊匹配
4. 类型优先 (app > agent > command)
5. 使用频率
```

### 6.3 关键词高亮

```
输入: "dev"
结果: "Developer Agent"
高亮: "<mark>Dev</mark>eloper Agent"

输入: "set"
结果: "Settings"
高亮: "<mark>Set</mark>tings"
```

---

## 7. 可访问性

### 7.1 ARIA 属性

```html
<div
  role="dialog"
  aria-modal="true"
  aria-label="Global command search"
  onKeyDown={handleKeys}
>
  <input
    type="search"
    aria-label="Search apps, commands, and agents"
    placeholder="Search..."
    autoFocus
  />

  <div role="listbox" aria-label="Search results">
    <div role="option" aria-selected="false">
      Finder
    </div>
    ...
  </div>
</div>
```

### 7.2 屏幕阅读器

**打开状态**: "Global command search dialog opened. Press Tab to search or Arrow keys to browse results."

**结果选中**: " Developer Agent, selected"

**结果导航**: "1 of 5 results. Press Enter to select."

### 7.3 键盘导航

- `Tab`: 进入搜索框
- `Shift+Tab`: 离开搜索框
- `↑↓`: 选择结果
- `Enter`: 执行选中项
- `Esc`: 关闭

---

## 8. 交互原型

### 8.1 打开状态

```
┌─────────────────────────────────────────────────┐
│  🔍 Search...                            [x]  │
├─────────────────────────────────────────────────┤
│  📄  Finder                              ↵  │  ← 光标闪烁
│  💻  Developer Agent                     ↵  │
│  ⚙️  Settings                            ↵  │
│  🎨  UX Designer Agent                   ↵  │
│  🧪  QA Engineer Agent                   ↵  │
│                                             │
│  [ 5 results ]  ↑↓ navigate  ↵ select        │
└─────────────────────────────────────────────────┘
```

### 8.2 搜索中

```
输入: "dev"
┌─────────────────────────────────────────────────┐
│  🔍 dev...                               [x]  │
├─────────────────────────────────────────────────┤
│  💻  Developer Agent              ↵ ● Running│  ← 匹配高亮
│  🧪  QA Engineer Agent              ↵          │  ← 部分匹配
│  📄  Dev Tools (VS Code)           ↵          │
│                                             │
│  [ 3 results matched "dev" ]  ↑↓ navigate ↵   │
└─────────────────────────────────────────────────┘
```

**关键词高亮**: "De**v**eloper" 匹配 "dev"

### 8.3 选中状态

```
按 ↓ 选择第二项
┌─────────────────────────────────────────────────┐
│  🔍 dev...                               [x]  │
├─────────────────────────────────────────────────┤
│  💻  Developer Agent              ↵ ● Running│
│  🧪  QA Engineer Agent              ↵          │  ← 选中高亮
│  📄  Dev Tools (VS Code)           ↵          │
│                                             │
│  [ 2 of 3 selected ]  ↑↓ navigate  ↵ select    │
└─────────────────────────────────────────────────┘
```

---

## 9. 错误处理

### 9.1 无结果

```
输入: "xyz" (无匹配)
┌─────────────────────────────────────────────────┐
│  🔍 xyz...                               [x]  │
├─────────────────────────────────────────────────┤
│  👻 No results found for "xyz"               │
│                                             │
│  Try: typing less keywords, check spelling   │
│                                             │
└─────────────────────────────────────────────────┘
```

### 9.2 加载状态

```typescript
// 搜索异步数据时显示
function SpotlightResults({ isLoading, results }) {
  if (isLoading) {
    return <div className="spinner">Searching...</div>;
  }
  return <ResultsList items={results} />;
}
```

---

## 10. 验收标准

### 交互验收

- [ ] Cmd+K 打开/关闭
- [ ] Esc 关闭面板
- [ ] 搜索框自动聚焦
- [ ] 搜索去抖执行
- [ ] 键盘导航可用
- [ ] 选中高亮正确
- [ ] 高亮关键词显示

### 视觉验收

- [ ] 打开动画流畅
- [ ] 关闭动画流畅
- [ ] 高亮颜色正确
- [ ] 结果排列清晰
- [ ] 底部提示显示

### 可访问性验收

- [ ] ARIA 标签完整
- [ ] 屏幕阅读器描述正确
- [ ] Tab 键导航可用
- [ ] 高对比度模式

---

## 11. 附录

### 11.1 设计资产

- 交互演示: `[待创建链接]`
- Figma 原型: `[待创建链接]`

### 11.2 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-07 | v1.0 | 初始版本 | UX Designer |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
