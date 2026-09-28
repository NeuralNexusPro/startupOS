# Story OS.6: Fluent 动画系统

**状态:** Planning
**优先级:** High
**估计工时:** 2 天
**调度:** Week 2, Days 8-10

---

## 用户故事

> 作为用户，我希望界面元素过渡有流畅的动画效果，这样操作感觉更自然。

---

## 功能需求

### 核心功能
- **缓动函数**：非线性的有生命的缓动（cubic-bezier 0.36, 0, 0.66, -0.56）
- **微交互**：按钮悬停反馈
- **转场动画**：界面切换过渡淡入淡出
- **动画钩子**：useAnimation、useSpring

### 动画规范

```css
/* Fluent 动画缓动 */
.fluent-transition {
  transition: all 0.32s cubic-bezier(0.36, 0, 0.66, -0.56);
}

/* 悬停动画 */
.hover-lift {
  transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
}

.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

/* 淡入淡出 */
.fade-enter {
  opacity: 0;
  transform: translateY(10px);
}

.fade-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.32s ease, transform 0.32s ease;
}
```

---

## 验收标准

- [ ] 动画流畅（60fps 稳定）
- [ ] 缓动函数正确应用（4 种动画类型）
- [ ] 悬停动画响应迅速（< 50ms）
- [ ] 转场过渡平滑（淡入淡出）
- [ ] 性能优化（使用 transform/opacity）

---

## 依赖关系

**前置依赖:** OS.5 (Acrylic 材质)
**后置依赖:** OS.8 (系统集成)

---

## 相关文档

- Epic README: `docs/specs/epic-OS/README.md`
- 交互设计: `docs/ux/design/os-interaction-redesign.md`
