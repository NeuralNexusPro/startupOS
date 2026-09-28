# Story OS.5: Acrylic 材质系统 - 架构设计文档 (ADD)

**版本**: v1.0
**日期**: 2026-03-09
**状态**: 草稿
**批准状态**: 待批准

---

## 1. 架构概述

### 1.1 系统目标

构建高性能、可复用的 Acrylic 材质系统：
- 组件化设计
- 主题支持
- 性能优化
- 浏览器兼容

### 1.2 技术栈

| 技术 | 版本 | 用途 |
|-----|------|------|
| React | 18+ | 组件框架 |
| TypeScript | 5+ | 类型安全 |
| Tailwind CSS | 3+ | 样式系统 |
| CSS backdrop-filter | - | 模糊效果 |

---

## 2. 系统架构

### 2.1 组件层次

```
src/components/os/acrylic/
├── index.ts              # 导出
├── AcrylicDialog.tsx     # 对话框组件
├── AcrylicPanel.tsx      # 面板组件
├── useAcrylic.ts         # Hook
└── __tests__/
    └── Acrylic.test.tsx  # 测试
```

### 2.2 样式架构

```
src/styles/
└── acrylic.css           # Acrylic 样式

tailwind.config.ts        # Tailwind 配置
```

---

## 3. 组件设计

### 3.1 AcrylicDialog 组件

**接口定义:**
```typescript
interface AcrylicDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  variant?: 'standard' | 'subtle' | 'strong';
}
```

**实现要点:**
- Portal 渲染到 body
- 背景遮罩点击关闭
- Esc 键关闭
- 焦点管理

### 3.2 AcrylicPanel 组件

**接口定义:**
```typescript
interface AcrylicPanelProps {
  children: ReactNode;
  variant?: 'standard' | 'subtle' | 'strong';
  className?: string;
}
```

**实现要点:**
- 简单容器组件
- 支持自定义样式
- 主题响应

---

## 4. 样式系统

### 4.1 Tailwind 配置

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      backdropBlur: {
        'acrylic': '20px',
      },
      backdropSaturate: {
        'acrylic': '180%',
      },
    },
  },
};
```

### 4.2 CSS 类定义

```css
/* acrylic.css */
.acrylic-base {
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.acrylic-light {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.acrylic-dark {
  background: rgba(31, 41, 55, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.32);
}
```

---

## 5. 性能优化

### 5.1 GPU 加速

```css
.acrylic {
  will-change: backdrop-filter;
  transform: translateZ(0);
}
```

### 5.2 降级策略

```typescript
// useAcrylic.ts
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(20px)');

export function useAcrylic() {
  return {
    supportsBackdropFilter,
    fallbackClass: supportsBackdropFilter ? '' : 'acrylic-fallback',
  };
}
```

---

## 6. 浏览器兼容

### 6.1 特性检测

```typescript
const hasBackdropFilter =
  'backdropFilter' in document.documentElement.style ||
  'webkitBackdropFilter' in document.documentElement.style;
```

### 6.2 Polyfill 策略

不支持 backdrop-filter 时使用纯色背景：
```css
@supports not (backdrop-filter: blur(20px)) {
  .acrylic {
    background: rgba(255, 255, 255, 0.95) !important;
  }
}
```

---

## 7. 测试策略

### 7.1 单元测试

- 组件渲染测试
- Props 传递测试
- 事件处理测试

### 7.2 视觉测试

- 模糊效果验证
- 主题切换验证
- 响应式布局验证

---

## 8. 部署考虑

### 8.1 CSS 优化

- 使用 PostCSS 自动添加前缀
- 压缩 CSS 文件
- 移除未使用的样式

### 8.2 性能监控

- 监控渲染性能
- 检测降级使用率
- 收集兼容性数据

---

## 附录

### A. 技术参考

- [CSS backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
- [Fluent Design](https://fluent2.microsoft.design/)

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
