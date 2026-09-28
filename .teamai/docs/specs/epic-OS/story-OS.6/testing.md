# Story OS.6: Fluent 动画系统 - 测试计划

**版本**: v1.0
**日期**: 2026-03-12
**状态**: 待执行
**QA Engineer**: QA Engineer

---

## 1. 测试概述

### 1.1 测试范围

本测试计划覆盖 OS.6 Fluent 动画系统的全面验证。

| 测试类型 | 优先级 | 状态 |
|---------|--------|------|
| 功能测试 | P0 | 待执行 |
| 性能测试 | P0 | 待执行 |
| 可访问性测试 | P1 | 待执行 |
| 集成测试 | P1 | 待执行 |

### 1.2 测试环境

| 环境 | 配置 |
|------|------|
| 测试工具 | Jest, Vitest, Playwright |
| 目标帧率 | 60fps |
| 目标浏览器 | Chrome, Firefox, Safari |

---

## 2. 实现状态

### 2.1 已实现组件

| 组件 | 文件路径 | 状态 |
|------|---------|------|
| durations | `src/lib/animations/durations.ts` | ✅ 已实现 |
| easings | `src/lib/animations/easings.ts` | ✅ 已实现 |
| useAnimation | `src/lib/animations/useAnimation.ts` | ✅ 已实现 |
| useTransition | `src/lib/animations/useTransition.ts` | ✅ 已实现 |
| useSpring | `src/lib/animations/useSpring.ts` | ✅ 已实现 |
| useReducedMotion | `src/lib/animations/useReducedMotion.ts` | ✅ 已实现 |

---

## 3. 功能测试用例

### 3.1 durations 常量测试

#### TC-FUNC-001: 时长常量验证

**测试步骤:**
1. 验证 durations.instant = 100ms
2. 验证 durations.fast = 200ms
3. 验证 durations.normal = 300ms
4. 验证 durations.slow = 500ms
5. 验证 durations.enter = 250ms
6. 验证 durations.exit = 200ms

**预期结果:**
- ✅ 所有时长常量正确

### 3.2 easings 缓动函数测试

#### TC-FUNC-002: 缓动函数验证

**测试步骤:**
1. 验证 easings.standard 存在
2. 验证 easings.accelerate 存在
3. 验证 easings.decelerate 存在
4. 验证缓动函数值符合 Fluent 规范

**预期结果:**
- ✅ 所有缓动函数正确导出
- ✅ 值符合 CSS cubic-bezier 格式

### 3.3 useAnimation Hook 测试

#### TC-FUNC-003: useAnimation 基本功能

**测试步骤:**
1. 渲染使用 useAnimation 的组件
2. 调用 start() 方法
3. 验证 isAnimating 状态变化
4. 验证 onComplete 回调触发

**预期结果:**
- ✅ start() 正确触发动画
- ✅ isAnimating 状态正确更新
- ✅ onComplete 回调正确触发

#### TC-FUNC-004: useAnimation 停止动画

**测试步骤:**
1. 开始动画
2. 调用 stop() 方法
3. 验证动画停止

**预期结果:**
- ✅ stop() 正确停止动画
- ✅ isAnimating 重置为 false

#### TC-FUNC-005: useAnimation 重置

**测试步骤:**
1. 开始并完成动画
2. 调用 reset() 方法
3. 验证状态重置

**预期结果:**
- ✅ reset() 正确重置所有状态

### 3.4 useTransition Hook 测试

#### TC-FUNC-006: useTransition 进入动画

**测试步骤:**
1. 设置 isVisible = true
2. 验证 status = 'entering'
3. 等待动画完成
4. 验证 status = 'entered'

**预期结果:**
- ✅ 进入状态正确转换
- ✅ style 正确应用

#### TC-FUNC-007: useTransition 退出动画

**测试步骤:**
1. 设置 isVisible = false
2. 验证 status = 'exiting'
3. 等待动画完成
4. 验证 status = 'exited'

**预期结果:**
- ✅ 退出状态正确转换
- ✅ 组件正确卸载

#### TC-FUNC-008: useTransition 类型测试

**测试步骤:**
1. 测试 type = 'fade'
2. 测试 type = 'slide'
3. 测试 type = 'scale'

**预期结果:**
- ✅ 每种类型生成正确的 style

### 3.5 useSpring Hook 测试

#### TC-FUNC-009: useSpring 物理动画

**测试步骤:**
1. 设置初始值
2. 设置目标值
3. 验证弹簧动画值变化

**预期结果:**
- ✅ 弹簧物理正确模拟
- ✅ 阻尼效果正确

### 3.6 useReducedMotion Hook 测试

#### TC-FUNC-010: useReducedMotion 系统偏好

**测试步骤:**
1. Mock window.matchMedia
2. 设置 prefers-reduced-motion: reduce
3. 验证 hook 返回 true

**预期结果:**
- ✅ 正确检测系统偏好
- ✅ 值变化时正确更新

---

## 4. 性能测试用例

### 4.1 帧率测试

#### TC-PERF-001: 动画帧率验证

**测试步骤:**
1. 启动动画
2. 使用 DevTools Performance 录制
3. 分析帧率数据

**预期结果:**
- ✅ 平均帧率 >= 60fps
- ✅ 无明显丢帧
- ✅ 帧时间 < 16.67ms

### 4.2 GPU 加速测试

#### TC-PERF-002: GPU 加速验证

**测试步骤:**
1. 检查动画元素
2. 验证 transform 和 opacity 动画
3. 验证 will-change 使用

**预期结果:**
- ✅ 使用 GPU 加速属性
- ✅ will-change 正确设置和清理

### 4.3 内存测试

#### TC-PERF-003: 内存泄漏检测

**测试步骤:**
1. 记录初始内存
2. 执行 100 次动画循环
3. 记录最终内存
4. 执行垃圾回收
5. 验证内存回收

**预期结果:**
- ✅ 内存正确回收
- ✅ 无明显内存泄漏

---

## 5. 可访问性测试

### 5.1 Reduced Motion 支持

#### TC-A11Y-001: 系统偏好降级

**测试步骤:**
1. 设置系统 prefers-reduced-motion: reduce
2. 验证动画时长降级为 0
3. 验证无动画视觉变化

**预期结果:**
- ✅ 正确检测系统偏好
- ✅ 动画正确降级
- ✅ 用户体验保持良好

---

## 6. 集成测试

### 6.1 与 OS.5 Acrylic 集成

#### TC-INT-001: AcrylicDialog 动画

**测试步骤:**
1. 打开 AcrylicDialog
2. 验证进入动画
3. 关闭 AcrylicDialog
4. 验证退出动画

**预期结果:**
- ✅ 动画流畅
- ✅ 时长正确

### 6.2 与 OS.7 Agent 托管集成

#### TC-INT-002: Agent 对话框动画

**测试步骤:**
1. 点击 Agent 图标
2. 验证对话框动画
3. 验证状态指示器动画

**预期结果:**
- ✅ 打开动画流畅
- ✅ 脉动动画正确

---

## 7. 测试执行计划

### 7.1 执行顺序

```
Phase 1: 功能测试 (P0) → 30 分钟
Phase 2: 性能测试 (P0) → 20 分钟
Phase 3: 可访问性测试 (P1) → 15 分钟
Phase 4: 集成测试 (P1) → 15 分钟
```

---

## 8. 验收标准

- [ ] 所有功能测试通过
- [ ] 动画帧率 >= 60fps
- [ ] 无内存泄漏
- [ ] reduced-motion 正确支持
- [ ] 与 OS.5/OS.7 集成正常

---

**创建时间**: 2026-03-12
**文档版本**: v1.0
