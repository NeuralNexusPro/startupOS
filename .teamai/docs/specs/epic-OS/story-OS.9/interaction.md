# Story OS.9: 应用窗口系统 - UX 设计规范

**版本**: v1.0
**日期**: 2026-03-13
**状态**: 设计规范
**UX Designer**: UX Design Team

---

## 1. 设计目标

### 1.1 核心体验目标

- **原生感**: 窗口操作体验接近 macOS/Windows 原生窗口
- **流畅性**: 拖拽、调整大小动画流畅 (60fps)
- **一致性**: 与现有 Acrylic 材质和 Fluent 动画风格一致
- **易用性**: 直观的窗口控制操作

### 1.2 设计参考

- macOS 窗口管理
- Windows 11 窗口管理
- Fluent Design System

---

## 2. 窗口视觉设计

### 2.1 窗口框架

```
┌─────────────────────────────────────────────────────────┐
│  🔵 🔵 🔵    [图标] 窗口标题                    ─ □ ✕  │ ← 标题栏 (40px)
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                     窗口内容区域                          │ ← 内容区
│                                                         │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 窗口尺寸规范

| 属性 | 默认值 | 最小值 | 最大值 |
|------|--------|--------|--------|
| 宽度 | 800px | 400px | 1920px |
| 高度 | 600px | 300px | 1080px |
| 标题栏高度 | 40px | - | - |
| 圆角半径 | 12px | - | - |
| 阴影 | 0 25px 50px rgba(0,0,0,0.25) | - | - |

### 2.3 窗口控制按钮

**macOS 风格 (默认)**:

```
🔴 关闭    🟡 最小化    🟢 最大化
(红)      (黄)        (绿)
```

- 按钮大小: 12px 圆形
- 间距: 8px
- 悬停效果: 显示图标

**悬停状态**:
- 关闭: 显示 × 图标
- 最小化: 显示 − 图标
- 最大化: 显示 □ 图标

### 2.4 Acrylic 材质应用

```css
.window-frame {
  /* Acrylic 背景 */
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);

  /* 边框 */
  border: 1px solid rgba(255, 255, 255, 0.5);

  /* 阴影 */
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);

  /* 圆角 */
  border-radius: 12px;
}

.window-frame.focused {
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.25),
    0 0 0 2px rgba(59, 130, 246, 0.5);
}

.window-frame.unfocused {
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}
```

---

## 3. 窗口交互设计

### 3.1 拖拽移动

**触发区域**: 标题栏 (整个 40px 高度)

**交互流程**:
1. 鼠标按下标题栏 → 光标变为 `grabbing`
2. 拖动 → 窗口跟随鼠标移动
3. 鼠标释放 → 窗口定位到新位置

**边界约束**:
- 窗口至少保留 100px 在屏幕内
- 拖动到屏幕顶部 → 显示最大化预览

**动画**:
```css
.window-frame {
  transition: transform 0.1s ease-out;
}

.window-frame.dragging {
  transition: none; /* 拖动时禁用动画 */
}
```

### 3.2 调整大小

**调整手柄位置**:
- 8 个方向: 上、下、左、右、左上、右上、左下、右下
- 手柄大小: 4px 边框区域
- 光标: `ns-resize` / `ew-resize` / `nesw-resize` / `nwse-resize`

**约束**:
- 最小尺寸: 400px × 300px
- 最大尺寸: 1920px × 1080px
- 边界保持: 窗口不超过屏幕边界

**动画**:
```css
.window-frame {
  transition: width 0.15s ease, height 0.15s ease;
}

.window-frame.resizing {
  transition: none; /* 调整时禁用动画 */
}
```

### 3.3 窗口操作

#### 最小化

**效果**: 窗口缩小并飞向 Dock 图标

```css
@keyframes window-minimize {
  0% {
    transform: scale(1) translate(0, 0);
    opacity: 1;
  }
  100% {
    transform: scale(0.1) translate(var(--dock-x), var(--dock-y));
    opacity: 0;
  }
}

.window-frame.minimizing {
  animation: window-minimize 0.3s ease-out forwards;
}
```

#### 最大化

**效果**: 窗口放大到全屏

```css
@keyframes window-maximize {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
    width: 100vw;
    height: 100vh;
    left: 0;
    top: 0;
    border-radius: 0;
  }
}

.window-frame.maximizing {
  animation: window-maximize 0.3s ease-out forwards;
}
```

#### 关闭

**效果**: 窗口缩小并淡出

```css
@keyframes window-close {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0;
  }
}

.window-frame.closing {
  animation: window-close 0.2s ease-out forwards;
}
```

### 3.4 窗口聚焦

**聚焦状态变化**:
- 阴影增强
- 边框高亮 (蓝色)
- 标题栏背景变深

```css
.window-frame.focused {
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.25),
    0 0 0 2px rgba(59, 130, 246, 0.5);
}

.window-frame.unfocused {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  opacity: 0.9;
}
```

**点击聚焦**:
- 点击窗口任意位置 → 窗口获得焦点
- 点击其他窗口 → 当前窗口失去焦点

---

## 4. 响应式设计

### 4.1 桌面端 (≥1280px)

- 窗口默认尺寸: 800px × 600px
- 支持所有窗口操作
- 支持多窗口并存

### 4.2 平板端 (768px - 1279px)

- 窗口默认尺寸: 90% × 80%
- 禁用调整大小
- 单窗口模式 (打开新窗口关闭旧窗口)

### 4.3 移动端 (<768px)

- 全屏模式 (无窗口框架)
- 底部标签栏切换
- 无窗口管理

---

## 5. 动画规范

### 5.1 Fluent 动画缓动

```css
:root {
  /* 缓动函数 */
  --easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --easing-decelerate: cubic-bezier(0, 0, 0.2, 1);
  --easing-accelerate: cubic-bezier(0.4, 0, 1, 1);

  /* 持续时间 */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;
}
```

### 5.2 窗口动画时序

| 动画类型 | 持续时间 | 缓动函数 |
|---------|---------|---------|
| 打开 | 250ms | decelerate |
| 关闭 | 200ms | accelerate |
| 最小化 | 300ms | standard |
| 最大化 | 300ms | standard |
| 拖拽 | 无动画 | - |
| 调整大小 | 无动画 | - |
| 聚焦切换 | 150ms | standard |

---

## 6. 可访问性设计

### 6.1 键盘操作

| 快捷键 | 操作 |
|-------|------|
| `Cmd/Ctrl + W` | 关闭当前窗口 |
| `Cmd/Ctrl + M` | 最小化当前窗口 |
| `Cmd/Ctrl + F` | 最大化/还原当前窗口 |
| `Tab` | 在窗口元素间切换 |
| `Escape` | 取消操作 |

### 6.2 焦点指示

```css
.window-frame:focus {
  outline: none;
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.25),
    0 0 0 3px rgba(59, 130, 246, 0.5);
}
```

### 6.3 ARIA 属性

```html
<div
  role="dialog"
  aria-modal="false"
  aria-labelledby="window-title"
  aria-describedby="window-content"
>
  <div id="window-title">窗口标题</div>
  <div id="window-content">窗口内容</div>
</div>
```

---

## 7. 组件设计

### 7.1 WindowTitleBar

```tsx
interface WindowTitleBarProps {
  title: string;
  icon?: string;
  isFocused: boolean;
  isMaximized: boolean;
  constraints: WindowConstraints;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}
```

### 7.2 WindowControls

```tsx
interface WindowControlsProps {
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  showMinimize: boolean;
  showMaximize: boolean;
  isMaximized: boolean;
}
```

### 7.3 WindowResizer

```tsx
interface WindowResizerProps {
  windowId: string;
  position: WindowPosition;
  constraints: WindowConstraints;
  onResize: (position: Partial<WindowPosition>) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}
```

---

## 8. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-13 | v1.0 | 初始 UX 设计 | UX Designer |

---

**批准签名**:

- [ ] 产品经理 (PM)
- [x] UX 设计师
- [ ] 开发负责人
