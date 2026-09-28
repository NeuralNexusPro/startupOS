# Story OS.5: Acrylic 材质系统 - 交互设计文档 (IDD)

**版本**: v1.0
**日期**: 2026-03-09
**状态**: 草稿
**批准状态**: 待批准

---

## 1. 设计概述

### 1.1 设计目标

创建符合 Fluent Design 的 Acrylic 玻璃态材质系统：
- 视觉深度 - 通过模糊和透明创建层次感
- 轻盈质感 - 减少界面视觉重量
- 内容聚焦 - 突出前景内容
- 性能优化 - GPU 加速渲染

### 1.2 设计原则

| 原则 | 实施 |
|-----|------|
| **层次清晰** | 3 层视觉结构（背景-材质-内容） |
| **性能优先** | GPU 加速 + 降级方案 |
| **可访问性** | 对比度 > 4.5:1 |
| **一致性** | 统一的材质参数 |

### 1.3 设计参考

- **Fluent Design**: Microsoft 的 Acrylic 材质
- **macOS**: 毛玻璃效果
- **iOS**: 模糊背景面板

---

## 2. 视觉规范

### 2.1 Acrylic 材质参数

**浅色主题:**
```css
.acrylic-light {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
```

**深色主题:**
```css
.acrylic-dark {
  background: rgba(31, 41, 55, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.32);
}
```

### 2.2 材质变体

| 变体 | 透明度 | 模糊 | 使用场景 |
|-----|--------|------|----------|
| **Standard** | 0.72 | 20px | 对话框、面板 |
| **Subtle** | 0.85 | 12px | 次要面板 |
| **Strong** | 0.60 | 30px | 强调内容 |

### 2.3 尺寸规范

| 元素 | 尺寸 | 说明 |
|-----|------|------|
| 圆角 | 12px | 标准圆角 |
| 边框 | 1px | 半透明边框 |
| 内边距 | 24px | 内容边距 |
| 最小宽度 | 320px | 移动端 |
| 最大宽度 | 600px | 对话框 |

---

## 3. 组件设计

### 3.1 AcrylicDialog 组件

**用途:** 模态对话框容器

**结构:**
```
┌─────────────────────────────────────┐
│  backdrop: blur(8px) rgba(0,0,0,0.4)│
│  ┌───────────────────────────────┐  │
│  │ [Acrylic Material]           │  │
│  │ ┌─────────────────────────┐  │  │
│  │ │ Title              [x] │  │  │
│  │ ├─────────────────────────┤  │  │
│  │ │                         │  │  │
│  │ │ Content Area            │  │  │
│  │ │                         │  │  │
│  │ ├─────────────────────────┤  │  │
│  │ │  [Cancel]  [Confirm]   │  │  │
│  │ └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Props:**
- `title`: string - 标题
- `children`: ReactNode - 内容
- `onClose`: () => void - 关闭回调
- `actions`: ReactNode - 操作按钮

### 3.2 AcrylicPanel 组件

**用途:** 通用面板容器

**结构:**
```
┌─────────────────────────┐
│ [Acrylic Material]     │
│ ┌───────────────────┐  │
│ │                   │  │
│ │  Content Area     │  │
│ │                   │  │
│ └───────────────────┘  │
└─────────────────────────┘
```

**Props:**
- `children`: ReactNode - 内容
- `variant`: 'standard' | 'subtle' | 'strong'
- `className`: string - 自定义样式

---

## 4. 交互规范

### 4.1 状态定义

| 状态 | 视觉效果 | 触发条件 |
|-----|---------|----------|
| **默认** | 标准 Acrylic | 初始状态 |
| **悬停** | 边框高亮 | 鼠标悬停 |
| **聚焦** | 蓝色边框 | 键盘聚焦 |
| **禁用** | 降低透明度 | disabled |

### 4.2 动画规范

**打开动画:**
```css
@keyframes acrylic-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

**关闭动画:**
```css
@keyframes acrylic-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.96);
  }
}
```

**时长:** 200ms
**缓动:** cubic-bezier(0.16, 1, 0.3, 1)

---

## 5. 可访问性

### 5.1 对比度要求

| 元素 | 对比度 | 标准 |
|-----|--------|------|
| 标题文本 | > 7:1 | AAA |
| 正文文本 | > 4.5:1 | AA |
| 次要文本 | > 3:1 | 最低 |

### 5.2 ARIA 属性

```html
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  className="acrylic-dialog"
>
  <h2 id="dialog-title">Dialog Title</h2>
  <div role="document">
    Content
  </div>
</div>
```

---

## 6. 浏览器兼容性

### 6.1 降级策略

**不支持 backdrop-filter:**
```css
@supports not (backdrop-filter: blur(20px)) {
  .acrylic {
    background: rgba(255, 255, 255, 0.95);
  }
}
```

**性能降级:**
```css
@media (prefers-reduced-motion: reduce) {
  .acrylic {
    backdrop-filter: none;
    background: rgba(255, 255, 255, 0.95);
  }
}
```

---

## 7. 验收标准

### 交互验收

- [ ] AcrylicDialog 正确显示
- [ ] AcrylicPanel 正确显示
- [ ] 模糊效果可见
- [ ] 动画流畅 (60fps)
- [ ] 主题切换正确

### 视觉验收

- [ ] 玻璃态质感正确
- [ ] 边框和阴影正确
- [ ] 对比度达标
- [ ] 响应式布局正确

### 可访问性验收

- [ ] ARIA 属性完整
- [ ] 键盘导航可用
- [ ] 屏幕阅读器支持
- [ ] 高对比度模式

---

## 附录

### A. 设计资产

- Figma 原型: [待创建]
- 交互演示: [待创建]

### B. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-09 | v1.0 | 初始版本 | UX Designer |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
