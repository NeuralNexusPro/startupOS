# Story OS.6: Fluent 动画系统 - 交互设计文档 (IDD)

**版本**: v1.0
**日期**: 2026-03-09
**状态**: 草稿
**批准状态**: 待批准

---

## 1. 设计概述

### 1.1 动画原则

| 原则 | 实施 |
|-----|------|
| **自然流畅** | 使用物理缓动曲线 |
| **即时响应** | < 100ms 反馈 |
| **性能优先** | GPU 加速 60fps |
| **可访问性** | 支持 reduced-motion |

---

## 2. 缓动函数规范

### 2.1 标准缓动

```typescript
export const easings = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
};
```

### 2.2 动画时长

```typescript
export const durations = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
};
```

---

## 3. 微交互动画

### 3.1 Hover 悬停

```css
.interactive {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.interactive:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### 3.2 Focus 聚焦

```css
.interactive:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
  transition: outline 100ms;
}
```

### 3.3 Press 按压

```css
.interactive:active {
  transform: scale(0.98);
  transition: transform 100ms cubic-bezier(0.4, 0, 0.6, 1);
}
```

---

## 4. 转场动画

### 4.1 Fade 淡入淡出

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

### 4.2 Slide 滑动

```css
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

### 4.3 Scale 缩放

```css
@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
```

---

## 5. 性能优化

### 5.1 GPU 加速

```css
.animated {
  will-change: transform, opacity;
  transform: translateZ(0);
}
```

### 5.2 避免重排

- 仅动画 transform 和 opacity
- 避免动画 width/height/margin
- 使用 position: absolute 隔离

---

## 6. 可访问性

### 6.1 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 附录

### 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-09 | v1.0 | 初始版本 | UX Designer |

---

**批准签名**：

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [ ] 系统架构师
- [ ] 开发负责人
