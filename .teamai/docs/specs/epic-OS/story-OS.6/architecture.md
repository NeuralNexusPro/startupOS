# Story OS.6: Fluent 动画系统 - 架构设计文档

**版本**: v1.0
**日期**: 2026-03-12
**状态**: 架构设计
**Architect**: System Architect

---

## 1. 概述

### 1.1 设计目标

创建统一的 Fluent 动画系统，为 OriginOS 提供流畅、一致、高性能的动画体验。

**核心原则:**
- **自然流畅**: 模拟物理世界的运动曲线
- **响应迅速**: < 100ms 即时反馈
- **性能优先**: 60fps GPU 加速
- **可访问性**: 支持 prefers-reduced-motion

### 1.2 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  (Components using animations: Dock, Spotlight, Agent)  │
├─────────────────────────────────────────────────────────┤
│                    Hook Layer                            │
│  (useAnimation, useSpring, useTransition, usePrefersReducedMotion) │
├─────────────────────────────────────────────────────────┤
│                   Animation Core                         │
│  (easings, durations, keyframes, utilities)             │
├─────────────────────────────────────────────────────────┤
│                    CSS Foundation                        │
│  (CSS Variables, Keyframes, Utility Classes)            │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 文件结构

```
src/
├── styles/
│   ├── acrylic.css           # 已存在 - Acrylic 材质
│   ├── fluent-animations.css # 新增 - Fluent 动画系统
│   └── globals.css           # 全局样式入口
│
├── hooks/
│   ├── useAnimation.ts       # 新增 - 通用动画 Hook
│   ├── useSpring.ts          # 新增 - 弹簧动画 Hook
│   ├── useTransition.ts      # 新增 - 转场动画 Hook
│   └── usePrefersReducedMotion.ts # 新增 - 偏好检测
│
├── lib/
│   └── animations/
│       ├── index.ts          # 导出入口
│       ├── easings.ts        # 缓动函数
│       ├── durations.ts      # 动画时长
│       ├── keyframes.ts      # 关键帧定义
│       └── types.ts          # 类型定义
│
└── types/
    └── animation.ts          # 新增 - 动画类型定义
```

---

## 3. 核心模块设计

### 3.1 CSS 变量系统

**文件:** `src/styles/fluent-animations.css`

```css
:root {
  /* ===== Fluent 缓动函数 ===== */
  --fluent-easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --fluent-easing-decelerate: cubic-bezier(0, 0, 0.2, 1);
  --fluent-easing-accelerate: cubic-bezier(0.4, 0, 1, 1);
  --fluent-easing-sharp: cubic-bezier(0.4, 0, 0.6, 1);
  --fluent-easing-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ===== 动画时长 ===== */
  --fluent-duration-instant: 100ms;
  --fluent-duration-fast: 200ms;
  --fluent-duration-normal: 300ms;
  --fluent-duration-slow: 500ms;
  --fluent-duration-slower: 700ms;

  /* ===== 动画延迟 ===== */
  --fluent-delay-none: 0ms;
  --fluent-delay-short: 50ms;
  --fluent-delay-medium: 100ms;
  --fluent-delay-long: 200ms;

  /* ===== 变换原点 ===== */
  --fluent-origin-center: center center;
  --fluent-origin-top: center top;
  --fluent-origin-bottom: center bottom;
}
```

### 3.2 缓动函数库

**文件:** `src/lib/animations/easings.ts`

```typescript
/**
 * Fluent 缓动函数
 * 基于 Microsoft Fluent Design System
 */
export const easings = {
  /** 通用动画 - 自然流畅 */
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',

  /** 进入动画 - 快进慢出 */
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',

  /** 退出动画 - 慢进快出 */
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',

  /** 快速响应 - 明确反馈 */
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',

  /** 弹性动画 - 活泼效果 */
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',

  /** 强调动画 - 显著效果 */
  emphasize: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const;

export type EasingName = keyof typeof easings;

/**
 * 获取缓动函数 CSS 值
 */
export function getEasing(name: EasingName): string {
  return easings[name];
}

/**
 * 获取缓动函数 CSS 变量
 */
export function getEasingVar(name: EasingName): string {
  return `var(--fluent-easing-${name})`;
}
```

### 3.3 动画时长库

**文件:** `src/lib/animations/durations.ts`

```typescript
/**
 * 动画时长定义
 */
export const durations = {
  /** 瞬时 - 微交互反馈 */
  instant: 100,

  /** 快速 - 小元素动画 */
  fast: 200,

  /** 标准 - 常规动画 */
  normal: 300,

  /** 慢速 - 大元素动画 */
  slow: 500,

  /** 更慢 - 复杂转场 */
  slower: 700,
} as const;

export type DurationName = keyof typeof durations;

/**
 * 获取动画时长（毫秒）
 */
export function getDuration(name: DurationName): number {
  return durations[name];
}

/**
 * 获取动画时长 CSS 变量
 */
export function getDurationVar(name: DurationName): string {
  return `var(--fluent-duration-${name})`;
}

/**
 * 获取动画时长字符串
 */
export function getDurationMs(name: DurationName): string {
  return `${durations[name]}ms`;
}
```

### 3.4 动画关键帧

**文件:** `src/styles/fluent-animations.css`

```css
/* ===========================================
   Fade 动画
   =========================================== */

@keyframes fluent-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fluent-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* ===========================================
   Scale 动画
   =========================================== */

@keyframes fluent-scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fluent-scale-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}

/* ===========================================
   Slide 动画
   =========================================== */

@keyframes fluent-slide-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fluent-slide-down {
  from {
    opacity: 0;
    transform: translateY(-16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fluent-slide-left {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fluent-slide-right {
  from {
    opacity: 0;
    transform: translateX(-16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ===========================================
   组合动画 (Scale + Fade + Slide)
   =========================================== */

@keyframes fluent-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes fluent-exit {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
}

/* ===========================================
   脉动动画 (用于 Agent 状态)
   =========================================== */

@keyframes fluent-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

/* ===========================================
   旋转动画
   =========================================== */

@keyframes fluent-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===========================================
   实用类
   =========================================== */

.fluent-animate-fade-in {
  animation: fluent-fade-in var(--fluent-duration-normal) var(--fluent-easing-decelerate) forwards;
}

.fluent-animate-fade-out {
  animation: fluent-fade-out var(--fluent-duration-fast) var(--fluent-easing-accelerate) forwards;
}

.fluent-animate-scale-in {
  animation: fluent-scale-in var(--fluent-duration-normal) var(--fluent-easing-decelerate) forwards;
}

.fluent-animate-scale-out {
  animation: fluent-scale-out var(--fluent-duration-fast) var(--fluent-easing-accelerate) forwards;
}

.fluent-animate-enter {
  animation: fluent-enter var(--fluent-duration-normal) var(--fluent-easing-decelerate) forwards;
}

.fluent-animate-exit {
  animation: fluent-exit var(--fluent-duration-fast) var(--fluent-easing-accelerate) forwards;
}

.fluent-animate-pulse {
  animation: fluent-pulse 2s var(--fluent-easing-standard) infinite;
}

.fluent-animate-spin {
  animation: fluent-spin 1s linear infinite;
}

/* ===========================================
   微交互动画
   =========================================== */

.fluent-interactive {
  transition: all var(--fluent-duration-fast) var(--fluent-easing-standard);
}

.fluent-interactive:hover {
  transform: translateY(-2px);
}

.fluent-interactive:active {
  transform: scale(0.98);
  transition: transform var(--fluent-duration-instant) var(--fluent-easing-sharp);
}

.fluent-interactive:focus-visible {
  outline: 2px solid var(--focus-ring-color, #3B82F6);
  outline-offset: 2px;
  transition: outline var(--fluent-duration-instant);
}

/* ===========================================
   Reduced Motion 支持
   =========================================== */

@media (prefers-reduced-motion: reduce) {
  .fluent-animate-fade-in,
  .fluent-animate-fade-out,
  .fluent-animate-scale-in,
  .fluent-animate-scale-out,
  .fluent-animate-enter,
  .fluent-animate-exit {
    animation: none;
    transition: opacity var(--fluent-duration-fast) ease;
  }

  .fluent-animate-pulse,
  .fluent-animate-spin {
    animation: none;
  }

  .fluent-interactive {
    transition: none;
  }

  .fluent-interactive:hover {
    transform: none;
  }

  .fluent-interactive:active {
    transform: none;
  }
}
```

---

## 4. React Hooks 设计

### 4.1 useAnimation Hook

**文件:** `src/hooks/useAnimation.ts`

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { easings, durations, EasingName, DurationName } from '@/lib/animations';

export interface AnimationConfig {
  duration?: DurationName | number;
  easing?: EasingName | string;
  delay?: number;
  onStart?: () => void;
  onComplete?: () => void;
}

export interface UseAnimationReturn {
  isAnimating: boolean;
  style: React.CSSProperties;
  start: (config?: AnimationConfig) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * 通用动画 Hook
 * 提供 CSS 动画的程序化控制
 */
export function useAnimation(
  keyframes: Keyframe[] | string,
  defaultConfig: AnimationConfig = {}
): UseAnimationReturn {
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<Animation | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const getDuration = useCallback((duration: DurationName | number): number => {
    return typeof duration === 'number' ? duration : durations[duration];
  }, []);

  const getEasing = useCallback((easing: EasingName | string): string => {
    return easing in easings ? easings[easing as EasingName] : easing;
  }, []);

  const start = useCallback((config: AnimationConfig = {}) => {
    const mergedConfig = { ...defaultConfig, ...config };
    const { duration = 'normal', easing = 'standard', delay = 0, onStart, onComplete } = mergedConfig;

    setIsAnimating(true);
    onStart?.();

    // 动画完成后回调
    const timeout = setTimeout(() => {
      setIsAnimating(false);
      onComplete?.();
    }, getDuration(duration) + delay);

    return () => clearTimeout(timeout);
  }, [defaultConfig, getDuration]);

  const stop = useCallback(() => {
    setIsAnimating(false);
    if (animationRef.current) {
      animationRef.current.cancel();
    }
  }, []);

  const reset = useCallback(() => {
    setIsAnimating(false);
    if (animationRef.current) {
      animationRef.current.cancel();
    }
  }, []);

  const style: React.CSSProperties = {
    animationDuration: `${getDuration(defaultConfig.duration || 'normal')}ms`,
    animationTimingFunction: getEasing(defaultConfig.easing || 'standard'),
    animationDelay: `${defaultConfig.delay || 0}ms`,
  };

  return { isAnimating, style, start, stop, reset };
}
```

### 4.2 useSpring Hook

**文件:** `src/hooks/useSpring.ts`

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';

export interface SpringConfig {
  tension?: number;  // 张力 (默认: 170)
  friction?: number; // 摩擦力 (默认: 26)
  mass?: number;     // 质量 (默认: 1)
  precision?: number; // 精度 (默认: 0.01)
}

export interface UseSpringReturn {
  value: number;
  isAnimating: boolean;
  set: (target: number) => void;
  animate: (from: number, to: number) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * 弹簧动画 Hook
 * 实现物理弹性动画效果
 */
export function useSpring(
  initialValue: number = 0,
  config: SpringConfig = {}
): UseSpringReturn {
  const [value, setValue] = useState(initialValue);
  const [isAnimating, setIsAnimating] = useState(false);

  const {
    tension = 170,
    friction = 26,
    mass = 1,
    precision = 0.01,
  } = config;

  const animationRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const targetRef = useRef(initialValue);

  const animate = useCallback((from: number, to: number) => {
    targetRef.current = to;
    velocityRef.current = 0;
    setValue(from);
    setIsAnimating(true);

    const step = () => {
      setValue((current) => {
        const target = targetRef.current;
        const spring = tension * (target - current);
        const damper = -friction * velocityRef.current;
        const acceleration = (spring + damper) / mass;

        velocityRef.current += acceleration * 0.001; // dt approximation

        const next = current + velocityRef.current;

        // 检查是否完成
        if (Math.abs(target - next) < precision && Math.abs(velocityRef.current) < precision) {
          setIsAnimating(false);
          return target;
        }

        animationRef.current = requestAnimationFrame(step);
        return next;
      });
    };

    animationRef.current = requestAnimationFrame(step);
  }, [tension, friction, mass, precision]);

  const set = useCallback((target: number) => {
    animate(value, target);
  }, [value, animate]);

  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      setIsAnimating(false);
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setValue(initialValue);
    velocityRef.current = 0;
  }, [initialValue, stop]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return { value, isAnimating, set, animate, stop, reset };
}
```

### 4.3 useTransition Hook

**文件:** `src/hooks/useTransition.ts`

```typescript
import { useState, useCallback, useRef } from 'react';
import { easings, durations, EasingName, DurationName } from '@/lib/animations';

export type TransitionState = 'entering' | 'entered' | 'exiting' | 'exited';

export interface TransitionConfig {
  duration?: DurationName;
  easing?: EasingName;
  onEntered?: () => void;
  onExited?: () => void;
  unmountOnExit?: boolean;
}

export interface UseTransitionReturn {
  state: TransitionState;
  isVisible: boolean;
  shouldRender: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
  style: React.CSSProperties;
}

/**
 * 转场动画 Hook
 * 管理进入/退出动画状态
 */
export function useTransition(
  initialVisible: boolean = false,
  config: TransitionConfig = {}
): UseTransitionReturn {
  const {
    duration = 'normal',
    easing = 'decelerate',
    onEntered,
    onExited,
    unmountOnExit = true,
  } = config;

  const [state, setState] = useState<TransitionState>(
    initialVisible ? 'entered' : 'exited'
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const durationMs = durations[duration];
  const easingValue = easings[easing];

  const clearCurrentTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const enter = useCallback(() => {
    clearCurrentTimeout();
    setState('entering');

    timeoutRef.current = setTimeout(() => {
      setState('entered');
      onEntered?.();
    }, durationMs);
  }, [durationMs, clearCurrentTimeout, onEntered]);

  const exit = useCallback(() => {
    clearCurrentTimeout();
    setState('exiting');

    timeoutRef.current = setTimeout(() => {
      setState('exited');
      onExited?.();
    }, durationMs);
  }, [durationMs, clearCurrentTimeout, onExited]);

  const toggle = useCallback(() => {
    if (state === 'entered' || state === 'entering') {
      exit();
    } else {
      enter();
    }
  }, [state, enter, exit]);

  const isVisible = state === 'entered' || state === 'entering';
  const shouldRender = !unmountOnExit || state !== 'exited';

  const style: React.CSSProperties = {
    transitionDuration: `${durationMs}ms`,
    transitionTimingFunction: easingValue,
  };

  return { state, isVisible, shouldRender, enter, exit, toggle, style };
}
```

### 4.4 usePrefersReducedMotion Hook

**文件:** `src/hooks/usePrefersReducedMotion.ts`

```typescript
import { useState, useEffect } from 'react';

/**
 * 检测用户是否偏好减少动画
 * 用于可访问性支持
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * 根据减少动画偏好返回动画时长
 */
export function useAnimationDuration(
  normalDuration: number,
  reducedDuration: number = 0
): number {
  const prefersReducedMotion = usePrefersReducedMotion();
  return prefersReducedMotion ? reducedDuration : normalDuration;
}

/**
 * 根据减少动画偏好返回动画配置
 */
export function useAnimationConfig(
  normalConfig: AnimationConfig,
  reducedConfig?: AnimationConfig
): AnimationConfig {
  const prefersReducedMotion = usePrefersReducedMotion();
  return prefersReducedMotion
    ? { ...normalConfig, ...reducedConfig, duration: 0 }
    : normalConfig;
}

interface AnimationConfig {
  duration?: number;
  easing?: string;
  delay?: number;
}
```

---

## 5. 类型定义

**文件:** `src/types/animation.ts`

```typescript
/**
 * 动画系统类型定义
 */

import { EasingName, DurationName } from '@/lib/animations';

// 动画方向
export type AnimationDirection = 'enter' | 'exit' | 'both';

// 动画类型
export type AnimationType =
  | 'fade'
  | 'scale'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'enter'
  | 'exit';

// 动画配置
export interface AnimationOptions {
  type: AnimationType;
  duration?: DurationName | number;
  easing?: EasingName | string;
  delay?: number;
  direction?: AnimationDirection;
}

// 转场配置
export interface TransitionOptions {
  enter?: AnimationType;
  exit?: AnimationType;
  duration?: DurationName;
  easing?: EasingName;
  unmountOnExit?: boolean;
}

// 弹簧配置
export interface SpringOptions {
  tension?: number;
  friction?: number;
  mass?: number;
  precision?: number;
}

// 关键帧
export interface Keyframe {
  offset: number;
  opacity?: number;
  transform?: string;
  [property: string]: string | number | undefined;
}
```

---

## 6. 性能优化指南

### 6.1 GPU 加速

```css
/* 仅动画 transform 和 opacity */
.animated-element {
  will-change: transform, opacity;
  transform: translateZ(0);
}

/* 避免触发重排 */
.avoid-reflow {
  position: absolute;
  contain: layout style;
}
```

### 6.2 动画优化检查清单

| 优化项 | 说明 |
|-------|------|
| ✅ 使用 transform | 避免动画 width/height/margin |
| ✅ 使用 opacity | 避免动画 color/background |
| ✅ will-change | 提示浏览器优化 |
| ✅ contain | 隔离动画影响范围 |
| ✅ requestAnimationFrame | 确保 60fps |
| ❌ 避免 layout thrashing | 批量读取/写入 DOM |

### 6.3 性能监控

```typescript
// FPS 监控
function measureFPS(callback: (fps: number) => void) {
  let frameCount = 0;
  let lastTime = performance.now();

  const measure = (currentTime: number) => {
    frameCount++;

    if (currentTime - lastTime >= 1000) {
      callback(frameCount);
      frameCount = 0;
      lastTime = currentTime;
    }

    requestAnimationFrame(measure);
  };

  requestAnimationFrame(measure);
}
```

---

## 7. 与现有系统集成

### 7.1 Acrylic 系统集成

```css
/* fluent-animations.css 与 acrylic.css 协同 */
.acrylic-panel {
  /* 使用 Fluent 动画变量 */
  transition:
    opacity var(--fluent-duration-normal) var(--fluent-easing-standard),
    transform var(--fluent-duration-normal) var(--fluent-easing-standard);
}

.acrylic-panel.fluent-animate-enter {
  animation: fluent-enter var(--fluent-duration-normal) var(--fluent-easing-decelerate);
}
```

### 7.2 Dock 图标集成

```typescript
// useDockIconAnimation 使用 Fluent 动画系统
import { easings, durations } from '@/lib/animations';

export function useDockIconAnimation() {
  return {
    // 使用 Fluent 标准
    styles: {
      transition: `transform ${durations.fast}ms ${easings.standard}`,
    },
    // ...
  };
}
```

---

## 8. 测试策略

### 8.1 单元测试

```typescript
// __tests__/useAnimation.test.ts
describe('useAnimation', () => {
  it('should start animation', () => {
    const { start, isAnimating } = renderHook(() => useAnimation(...));
    act(() => start());
    expect(isAnimating).toBe(true);
  });
});

// __tests__/useSpring.test.ts
describe('useSpring', () => {
  it('should animate to target', async () => {
    const { set, value } = renderHook(() => useSpring(0));
    act(() => set(100));
    await waitFor(() => expect(value).toBeCloseTo(100, 1));
  });
});
```

### 8.2 集成测试

```typescript
// __tests__/fluent-animations.test.ts
describe('Fluent Animations CSS', () => {
  it('should apply fade-in animation', () => {
    render(<div className="fluent-animate-fade-in" />);
    expect(element).toHaveStyle({ animationDuration: '300ms' });
  });
});
```

---

## 9. 实施计划

### 9.1 阶段一: 基础设施 (P0)

- [ ] 创建 `src/styles/fluent-animations.css`
- [ ] 创建 `src/lib/animations/` 目录结构
- [ ] 实现缓动函数和时长常量
- [ ] 添加 CSS 关键帧

### 9.2 阶段二: Hooks (P1)

- [ ] 实现 `useAnimation` Hook
- [ ] 实现 `useSpring` Hook
- [ ] 实现 `useTransition` Hook
- [ ] 实现 `usePrefersReducedMotion` Hook

### 9.3 阶段三: 集成 (P2)

- [ ] 集成到 Acrylic 组件
- [ ] 集成到 Dock 图标动画
- [ ] 集成到 Spotlight 动画
- [ ] 集成到 Agent 对话窗口

---

## 10. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-12 | v1.0 | 初始架构设计 | Architect |

---

**批准签名**:

- [ ] 产品经理 (PM)
- [ ] UX 设计师
- [x] 系统架构师
- [ ] 开发负责人
