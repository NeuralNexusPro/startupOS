# Story OS.9: 应用窗口系统 - 测试计划

**版本**: v1.0
**日期**: 2026-03-13
**状态**: 待执行
**QA Engineer**: QA Engineer

---

## 1. 测试概述

### 1.1 测试范围

本测试计划覆盖 Story OS.9 应用窗口系统的全面验证。

| 测试类型 | 优先级 | 预计工时 | 状态 |
|---------|--------|---------|------|
| 单元测试 (Store) | P0 | 2h | 待执行 |
| 单元测试 (Hooks) | P0 | 1.5h | 待执行 |
| 组件测试 | P0 | 3h | 待执行 |
| 集成测试 | P0 | 2h | 待执行 |
| E2E 测试 | P1 | 2h | 待执行 |
| 性能测试 | P2 | 1h | 待执行 |
| 可访问性测试 | P2 | 1h | 待执行 |

### 1.2 测试目标

- 确保窗口状态管理正确性和一致性
- 验证窗口操作的完整生命周期
- 确保窗口拖拽和调整大小功能正确
- 验证窗口层级和聚焦管理
- 确保组件渲染符合设计规范
- 验证多窗口并发场景
- 确保边界条件和错误处理

### 1.3 测试环境

- **测试框架**: Vitest + React Testing Library
- **E2E 框架**: Playwright
- **浏览器**: Chrome, Firefox, Safari
- **分辨率**: 1920x1080, 1366x768, 375x667 (移动端)

---

## 2. 已实现组件清单

### 2.1 核心模块

| 模块 | 文件路径 | 状态 |
|------|---------|------|
| 类型定义 | `src/types/app-window.ts` | ✅ 已实现 |
| 窗口 Store | `src/store/appWindowStore.ts` | ✅ 已实现 |
| useAppWindow Hook | `src/hooks/useAppWindow.ts` | ✅ 已实现 |
| useAppWindowManager Hook | `src/hooks/useAppWindowManager.ts` | ✅ 已实现 |

### 2.2 组件模块

| 组件 | 文件路径 | 状态 |
|------|---------|------|
| AppWindow | `src/components/os/window/AppWindow.tsx` | ✅ 已实现 |
| WindowTitleBar | `src/components/os/window/WindowTitleBar.tsx` | ✅ 已实现 |
| WindowControls | `src/components/os/window/WindowControls.tsx` | ✅ 已实现 |
| WindowResizer | `src/components/os/window/WindowResizer.tsx` | ✅ 已实现 |
| ViewRenderer | `src/components/os/window/ViewRenderer.tsx` | ✅ 已实现 |

---

## 3. 单元测试用例

### 3.1 appWindowStore 单元测试

**文件**: `src/store/__tests__/appWindowStore.test.ts`

#### TC-STORE-001: 窗口打开操作

**测试步骤:**
1. 初始化空 Store
2. 调用 `openWindow` 打开窗口
3. 验证窗口状态

**预期结果:**
- ✅ 窗口添加到 `windows` 对象
- ✅ 窗口 ID 添加到 `windowOrder` 数组
- ✅ `focusedWindowId` 设置为新窗口 ID
- ✅ `maxZIndex` 增加
- ✅ 窗口位置居中
- ✅ 窗口状态为 `normal`
- ✅ `isFocused` 为 `true`

#### TC-STORE-002: 窗口关闭操作

**测试步骤:**
1. 打开多个窗口
2. 关闭中间窗口
3. 验证状态变化

**预期结果:**
- ✅ 窗口从 `windows` 移除
- ✅ 窗口 ID 从 `windowOrder` 移除
- ✅ 最后一个窗口获得焦点

#### TC-STORE-003: 关闭所有窗口

**测试步骤:**
1. 打开多个窗口
2. 调用 `closeAllWindows`
3. 验证状态

**预期结果:**
- ✅ `windows` 为空对象
- ✅ `windowOrder` 为空数组
- ✅ `focusedWindowId` 为 `null`
- ✅ `maxZIndex` 重置为 `WINDOW_ZINDEX_BASE`

#### TC-STORE-004: 窗口最小化

**测试步骤:**
1. 打开窗口
2. 调用 `minimizeWindow`
3. 验证状态

**预期结果:**
- ✅ 窗口状态变为 `minimized`
- ✅ `isFocused` 为 `false`
- ✅ `focusedWindowId` 为 `null`

#### TC-STORE-005: 窗口最大化/还原

**测试步骤:**
1. 打开窗口
2. 调用 `maximizeWindow` (最大化)
3. 再次调用 `maximizeWindow` (还原)
4. 验证状态

**预期结果:**
- ✅ 最大化时状态为 `maximized`
- ✅ 最大化时位置为屏幕尺寸
- ✅ 还原时状态为 `normal`
- ✅ 还原时位置恢复默认

#### TC-STORE-006: 窗口还原

**测试步骤:**
1. 打开窗口并最小化
2. 调用 `restoreWindow`
3. 验证状态

**预期结果:**
- ✅ 窗口状态恢复为 `normal`

#### TC-STORE-007: 窗口聚焦

**测试步骤:**
1. 打开窗口 A 和 B
2. 聚焦窗口 A
3. 聚焦窗口 B
4. 验证状态变化

**预期结果:**
- ✅ 目标窗口 `isFocused` 为 `true`
- ✅ 其他窗口 `isFocused` 为 `false`
- ✅ `focusedWindowId` 更新
- ✅ `zIndex` 增加

#### TC-STORE-008: 窗口位置更新

**测试步骤:**
1. 打开窗口
2. 调用 `updateWindowPosition`
3. 验证位置约束

**预期结果:**
- ✅ 位置正确更新
- ✅ 边界约束生效 (`keepInBounds`)
- ✅ 尺寸约束生效 (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`)

#### TC-STORE-009: 拖拽状态设置

**测试步骤:**
1. 打开窗口
2. 设置 `setDragging(true)`
3. 设置 `setDragging(false)`
4. 验证状态

**预期结果:**
- ✅ `isDragging` 正确设置

#### TC-STORE-010: 调整大小状态设置

**测试步骤:**
1. 打开窗口
2. 设置 `setResizing(true)`
3. 设置 `setResizing(false)`
4. 验证状态

**预期结果:**
- ✅ `isResizing` 正确设置

#### TC-STORE-011: 获取窗口

**测试步骤:**
1. 打开窗口
2. 调用 `getWindow`
3. 验证返回数据

**预期结果:**
- ✅ 返回正确的窗口数据
- ✅ 不存在的窗口返回 `undefined`

#### TC-STORE-012: 获取打开的窗口列表

**测试步骤:**
1. 打开多个窗口
2. 最小化部分窗口
3. 调用 `getOpenWindows`
4. 验证返回列表

**预期结果:**
- ✅ 返回非最小化窗口列表
- ✅ 按 zIndex 排序

#### TC-STORE-013: 检查窗口是否打开

**测试步骤:**
1. 打开窗口
2. 调用 `isWindowOpen`
3. 关闭窗口
4. 再次调用

**预期结果:**
- ✅ 打开时返回 `true`
- ✅ 关闭后返回 `false`

#### TC-STORE-014: 多窗口层级管理

**测试步骤:**
1. 连续打开 5 个窗口
2. 验证每个窗口的 zIndex

**预期结果:**
- ✅ zIndex 递增 (每个 +10)
- ✅ 最后打开的窗口 zIndex 最大

#### TC-STORE-015: 窗口边界约束

**测试步骤:**
1. 打开窗口，设置 `keepInBounds: true`
2. 尝试移动窗口超出边界
3. 验证约束生效

**预期结果:**
- ✅ 窗口不超出屏幕边界
- ✅ 窗口至少保留 100px 在屏幕内

---

### 3.2 useAppWindow Hook 单元测试

**文件**: `src/hooks/__tests__/useAppWindow.test.ts`

#### TC-HOOK-001: 返回窗口数据

**测试步骤:**
1. 打开窗口
2. 调用 hook
3. 验证返回数据

**预期结果:**
- ✅ 返回正确的窗口数据
- ✅ 返回派生状态 (`isOpen`, `isFocused`, etc.)

#### TC-HOOK-002: 窗口操作方法

**测试步骤:**
1. 使用 hook 返回的方法
2. 验证 Store 状态变化

**预期结果:**
- ✅ `close()` 关闭窗口
- ✅ `minimize()` 最小化窗口
- ✅ `maximize()` 最大化窗口
- ✅ `restore()` 还原窗口
- ✅ `focus()` 聚焦窗口

#### TC-HOOK-003: 位置操作方法

**测试步骤:**
1. 调用 `move`
2. 调用 `resize`
3. 调用 `setPosition`
4. 验证位置更新

**预期结果:**
- ✅ `move` 更新 x, y
- ✅ `resize` 更新 width, height
- ✅ `setPosition` 更新完整位置

#### TC-HOOK-004: 状态操作方法

**测试步骤:**
1. 调用 `setDragging`
2. 调用 `setResizing`
3. 验证状态更新

**预期结果:**
- ✅ `setDragging` 更新拖拽状态
- ✅ `setResizing` 更新调整大小状态

#### TC-HOOK-005: 未打开窗口处理

**测试步骤:**
1. 对不存在的窗口调用 hook
2. 验证返回默认值

**预期结果:**
- ✅ `window` 为 `undefined`
- ✅ `isOpen` 为 `false`
- ✅ 方法调用不报错

---

### 3.3 useAppWindowManager Hook 单元测试

**文件**: `src/hooks/__tests__/useAppWindowManager.test.ts`

#### TC-MGR-001: 窗口管理状态

**测试步骤:**
1. 打开多个窗口
2. 验证 hook 返回状态

**预期结果:**
- ✅ `windows` 包含所有窗口
- ✅ `windowOrder` 正确
- ✅ `focusedWindowId` 正确
- ✅ `openWindowCount` 正确

#### TC-MGR-002: 窗口操作方法

**测试步骤:**
1. 调用 `openWindow`
2. 调用 `closeWindow`
3. 调用 `focusWindow`
4. 验证状态变化

**预期结果:**
- ✅ 所有操作方法正确工作

#### TC-MGR-003: 快捷方法

**测试步骤:**
1. 调用 `openComponentWindow`
2. 调用 `openIframeWindow`
3. 验证窗口创建

**预期结果:**
- ✅ `openComponentWindow` 创建正确类型的窗口
- ✅ `openIframeWindow` 创建正确类型的窗口

#### TC-MGR-004: 查询方法

**测试步骤:**
1. 调用 `getWindow`
2. 调用 `getOpenWindows`
3. 调用 `isWindowOpen`
4. 验证返回值

**预期结果:**
- ✅ 所有查询方法返回正确结果

---

## 4. 组件测试用例

### 4.1 AppWindow 组件测试

**文件**: `src/components/os/window/__tests__/AppWindow.test.tsx`

#### TC-COMP-001: 窗口渲染

**测试步骤:**
1. 渲染 AppWindow 组件
2. 检查 DOM 结构

**预期结果:**
- ✅ 窗口容器正确渲染
- ✅ 使用 `createPortal` 渲染到 `document.body`
- ✅ AcrylicPanel 应用于窗口背景

#### TC-COMP-002: 窗口聚焦

**测试步骤:**
1. 渲染窗口
2. 点击窗口
3. 验证聚焦状态

**预期结果:**
- ✅ 点击触发 `focusWindow`
- ✅ 窗口获得焦点样式 (`ring-2 ring-blue-500/50`)

#### TC-COMP-003: 窗口关闭

**测试步骤:**
1. 渲染窗口
2. 点击关闭按钮
3. 验证关闭回调

**预期结果:**
- ✅ 触发 `onClose` 回调
- ✅ 窗口从 DOM 移除

#### TC-COMP-004: 窗口最小化

**测试步骤:**
1. 渲染窗口
2. 点击最小化按钮
3. 验证窗口隐藏

**预期结果:**
- ✅ 窗口状态变为 `minimized`
- ✅ 窗口不渲染

#### TC-COMP-005: 窗口最大化

**测试步骤:**
1. 渲染窗口
2. 点击最大化按钮
3. 验证窗口全屏

**预期结果:**
- ✅ 窗口状态变为 `maximized`
- ✅ 窗口位置变为全屏

#### TC-COMP-006: 窗口拖拽

**测试步骤:**
1. 渲染窗口
2. 模拟鼠标拖拽标题栏
3. 验证位置更新

**预期结果:**
- ✅ 鼠标按下时 `isDragging` 为 `true`
- ✅ 窗口位置跟随鼠标移动
- ✅ 鼠标释放时 `isDragging` 为 `false`

#### TC-COMP-007: 最大化时禁止拖拽

**测试步骤:**
1. 最大化窗口
2. 尝试拖拽标题栏
3. 验证位置不变

**预期结果:**
- ✅ 最大化窗口不能拖拽

#### TC-COMP-008: 子组件渲染

**测试步骤:**
1. 渲染带子组件的窗口
2. 验证子组件显示

**预期结果:**
- ✅ 子组件正确渲染

#### TC-COMP-009: ViewRenderer 集成

**测试步骤:**
1. 渲染带 content 的窗口
2. 验证 ViewRenderer 渲染

**预期结果:**
- ✅ ViewRenderer 正确渲染内容

---

### 4.2 WindowTitleBar 组件测试

**文件**: `src/components/os/window/__tests__/WindowTitleBar.test.tsx`

#### TC-TITLE-001: 标题栏渲染

**测试步骤:**
1. 渲染标题栏
2. 检查元素

**预期结果:**
- ✅ 标题正确显示
- ✅ 图标正确显示 (如果提供)
- ✅ WindowControls 正确渲染

#### TC-TITLE-002: 聚焦状态样式

**测试步骤:**
1. 渲染聚焦状态
2. 渲染非聚焦状态
3. 比较样式

**预期结果:**
- ✅ 聚焦时背景更深
- ✅ 聚焦时标题颜色正确

#### TC-TITLE-003: 拖拽事件

**测试步骤:**
1. 模拟鼠标按下标题栏
2. 验证 `onDragStart` 调用

**预期结果:**
- ✅ 触发拖拽回调

#### TC-TITLE-004: 约束控制

**测试步骤:**
1. 设置 `allowMinimize: false`
2. 设置 `allowMaximize: false`
3. 验证按钮隐藏

**预期结果:**
- ✅ 最小化按钮隐藏
- ✅ 最大化按钮隐藏

---

### 4.3 WindowControls 组件测试

**文件**: `src/components/os/window/__tests__/WindowControls.test.tsx`

#### TC-CTRL-001: 按钮渲染

**测试步骤:**
1. 渲染控制按钮
2. 检查按钮数量

**预期结果:**
- ✅ 关闭按钮始终显示
- ✅ 最小化按钮根据 `showMinimize` 显示
- ✅ 最大化按钮根据 `showMaximize` 显示

#### TC-CTRL-002: 关闭按钮

**测试步骤:**
1. 点击关闭按钮
2. 验证回调

**预期结果:**
- ✅ 触发 `onClose` 回调
- ✅ 事件不冒泡

#### TC-CTRL-003: 最小化按钮

**测试步骤:**
1. 点击最小化按钮
2. 验证回调

**预期结果:**
- ✅ 触发 `onMinimize` 回调
- ✅ 事件不冒泡

#### TC-CTRL-004: 最大化/还原按钮

**测试步骤:**
1. 点击最大化按钮
2. 验证回调
3. 点击还原按钮
4. 验证回调

**预期结果:**
- ✅ 触发 `onMaximize` 回调
- ✅ 图标根据 `isMaximized` 变化

#### TC-CTRL-005: 悬停效果

**测试步骤:**
1. 悬停关闭按钮
2. 验证图标显示

**预期结果:**
- ✅ 悬停时显示 × 图标
- ✅ 悬停时显示 − 图标
- ✅ 悬停时显示 □ 图标

#### TC-CTRL-006: ARIA 标签

**测试步骤:**
1. 检查 ARIA 属性

**预期结果:**
- ✅ 关闭按钮有 `aria-label="Close"`
- ✅ 最小化按钮有 `aria-label="Minimize"`
- ✅ 最大化按钮有正确的 `aria-label`

---

### 4.4 WindowResizer 组件测试

**文件**: `src/components/os/window/__tests__/WindowResizer.test.tsx`

#### TC-RESIZE-001: 调整手柄渲染

**测试步骤:**
1. 渲染调整手柄
2. 检查 8 个方向手柄

**预期结果:**
- ✅ 渲染 8 个调整手柄 (n, s, e, w, ne, nw, se, sw)
- ✅ 每个手柄有正确的光标样式

#### TC-RESIZE-002: 东向调整

**测试步骤:**
1. 模拟东向手柄拖拽
2. 验证宽度更新

**预期结果:**
- ✅ 宽度正确更新
- ✅ 高度不变
- ✅ x, y 不变

#### TC-RESIZE-003: 西向调整

**测试步骤:**
1. 模拟西向手柄拖拽
2. 验证位置和宽度更新

**预期结果:**
- ✅ 宽度正确更新
- ✅ x 位置正确更新

#### TC-RESIZE-004: 南向调整

**测试步骤:**
1. 模拟南向手柄拖拽
2. 验证高度更新

**预期结果:**
- ✅ 高度正确更新
- ✅ 宽度不变

#### TC-RESIZE-005: 北向调整

**测试步骤:**
1. 模拟北向手柄拖拽
2. 验证位置和高度更新

**预期结果:**
- ✅ 高度正确更新
- ✅ y 位置正确更新

#### TC-RESIZE-006: 对角调整 (东南)

**测试步骤:**
1. 模拟东南角拖拽
2. 验证宽度和高度更新

**预期结果:**
- ✅ 宽度正确更新
- ✅ 高度正确更新

#### TC-RESIZE-007: 尺寸约束

**测试步骤:**
1. 尝试调整到小于最小尺寸
2. 尝试调整到大于最大尺寸
3. 验证约束生效

**预期结果:**
- ✅ 不小于 `minWidth` 和 `minHeight`
- ✅ 不大于 `maxWidth` 和 `maxHeight`

#### TC-RESIZE-008: 调整开始/结束回调

**测试步骤:**
1. 开始调整
2. 结束调整
3. 验证回调

**预期结果:**
- ✅ `onResizeStart` 在开始时调用
- ✅ `onResizeEnd` 在结束时调用

---

### 4.5 ViewRenderer 组件测试

**文件**: `src/components/os/window/__tests__/ViewRenderer.test.tsx`

#### TC-RENDER-001: 组件类型渲染

**测试步骤:**
1. 传入 React 组件
2. 验证渲染

**预期结果:**
- ✅ 组件正确渲染
- ✅ props 正确传递

#### TC-RENDER-002: iframe 类型渲染

**测试步骤:**
1. 传入 iframe 内容
2. 验证 iframe 渲染

**预期结果:**
- ✅ iframe 正确渲染
- ✅ `src` 属性正确
- ✅ `sandbox` 属性正确

#### TC-RENDER-003: iframe 加载状态

**测试步骤:**
1. 渲染 iframe
2. 检查加载指示器
3. 模拟加载完成

**预期结果:**
- ✅ 初始显示加载指示器
- ✅ 加载完成后隐藏指示器

#### TC-RENDER-004: iframe 错误处理

**测试步骤:**
1. 渲染 iframe
2. 触发错误

**预期结果:**
- ✅ 显示错误信息

#### TC-RENDER-005: microapp 类型渲染

**测试步骤:**
1. 传入 microapp 内容
2. 验证容器渲染

**预期结果:**
- ✅ 渲染容器
- ✅ 容器 ID 正确

#### TC-RENDER-006: view 类型渲染

**测试步骤:**
1. 传入 view 内容
2. 验证容器属性

**预期结果:**
- ✅ 渲染容器
- ✅ `data-view-id` 属性正确
- ✅ `data-view-code` 属性正确

#### TC-RENDER-007: 未知类型处理

**测试步骤:**
1. 传入未知类型
2. 验证错误显示

**预期结果:**
- ✅ 显示 "不支持的视图类型" 信息

---

## 5. 集成测试用例

### 5.1 ViewReconcilerAdapter 集成测试

**文件**: `src/services/__tests__/ViewReconcilerAdapter.test.ts`

#### TC-INT-001: 视图创建

**测试步骤:**
1. 创建 iframe 视图
2. 验证视图初始化

**预期结果:**
- ✅ 视图 ID 返回
- ✅ Reconciler 创建成功

#### TC-INT-002: 视图生命周期

**测试步骤:**
1. 创建视图
2. 暂停视图
3. 恢复视图
4. 销毁视图

**预期结果:**
- ✅ 暂停正确调用
- ✅ 恢复正确调用
- ✅ 销毁正确调用

#### TC-INT-003: 视图通信

**测试步骤:**
1. 创建视图
2. 发送消息
3. 监听消息

**预期结果:**
- ✅ 消息正确发送
- ✅ 消息正确接收

#### TC-INT-004: 多视图管理

**测试步骤:**
1. 创建多个视图
2. 操作单个视图
3. 验证不影响其他视图

**预期结果:**
- ✅ 视图独立管理
- ✅ 操作隔离

---

### 5.2 窗口与组件集成测试

**文件**: `src/components/os/window/__tests__/integration.test.tsx`

#### TC-INT-005: 完整窗口操作流程

**测试步骤:**
1. 打开窗口
2. 拖拽窗口
3. 调整窗口大小
4. 最小化窗口
5. 还原窗口
6. 最大化窗口
7. 关闭窗口

**预期结果:**
- ✅ 每个操作正确执行
- ✅ 状态正确同步

#### TC-INT-006: 多窗口交互

**测试步骤:**
1. 打开窗口 A
2. 打开窗口 B
3. 点击窗口 A
4. 验证层级和聚焦

**预期结果:**
- ✅ 窗口 B 在窗口 A 上层
- ✅ 点击窗口 A 后，A 获得焦点
- ✅ A 的 zIndex 增加

#### TC-INT-007: 窗口约束集成

**测试步骤:**
1. 打开带约束的窗口
2. 尝试超出约束的操作
3. 验证约束生效

**预期结果:**
- ✅ 尺寸约束生效
- ✅ 边界约束生效
- ✅ 操作约束生效

---

## 6. E2E 测试用例

### 6.1 窗口基础操作 E2E 测试

**文件**: `e2e/window.spec.ts`

#### TC-E2E-001: 窗口打开与关闭

**测试步骤:**
1. 访问 Desktop 页面
2. 打开窗口
3. 关闭窗口

**预期结果:**
- ✅ 窗口正确显示
- ✅ 关闭按钮工作正常
- ✅ 窗口从 DOM 移除

#### TC-E2E-002: 窗口拖拽

**测试步骤:**
1. 打开窗口
2. 拖拽标题栏移动窗口
3. 验证新位置

**预期结果:**
- ✅ 窗口跟随鼠标移动
- ✅ 位置正确更新

#### TC-E2E-003: 窗口调整大小

**测试步骤:**
1. 打开窗口
2. 拖拽右下角调整大小
3. 验证新尺寸

**预期结果:**
- ✅ 窗口大小正确调整
- ✅ 尺寸约束生效

#### TC-E2E-004: 窗口最小化/还原

**测试步骤:**
1. 打开窗口
2. 点击最小化按钮
3. 从 Dock 还原窗口

**预期结果:**
- ✅ 窗口隐藏
- ✅ 窗口正确还原

#### TC-E2E-005: 窗口最大化/还原

**测试步骤:**
1. 打开窗口
2. 点击最大化按钮
3. 再次点击还原

**预期结果:**
- ✅ 窗口全屏
- ✅ 窗口还原到之前位置

#### TC-E2E-006: 多窗口层级

**测试步骤:**
1. 打开多个窗口
2. 点击不同窗口
3. 验证层级变化

**预期结果:**
- ✅ 点击的窗口获得焦点
- ✅ z-index 正确更新

---

### 6.2 响应式测试

**文件**: `e2e/window-responsive.spec.ts`

#### TC-RESP-001: 桌面端窗口

**测试步骤:**
1. 设置视口 1920x1080
2. 打开窗口
3. 验证默认尺寸

**预期结果:**
- ✅ 默认尺寸 800x600
- ✅ 所有功能正常

#### TC-RESP-002: 平板端窗口

**测试步骤:**
1. 设置视口 1024x768
2. 打开窗口
3. 验证行为

**预期结果:**
- ✅ 窗口适应屏幕
- ✅ 调整大小可能受限

#### TC-RESP-003: 移动端窗口

**测试步骤:**
1. 设置视口 375x667
2. 验证窗口行为

**预期结果:**
- ✅ 可能切换到全屏模式
- ✅ 或禁用窗口管理

---

## 7. 性能测试用例

### 7.1 渲染性能

#### TC-PERF-001: 窗口打开性能

**测试步骤:**
1. 测量打开窗口时间
2. 重复 10 次

**预期结果:**
- ✅ 首次打开 < 200ms
- ✅ 后续打开 < 100ms

#### TC-PERF-002: 多窗口性能

**测试步骤:**
1. 打开 10 个窗口
2. 测量内存占用
3. 测量 CPU 占用

**预期结果:**
- ✅ 内存增量 < 50MB
- ✅ CPU 占用 < 15%
- ✅ 无明显卡顿

#### TC-PERF-003: 拖拽流畅度

**测试步骤:**
1. 拖拽窗口 5 秒
2. 测量帧率

**预期结果:**
- ✅ 维持 60fps
- ✅ 无明显延迟

#### TC-PERF-004: 调整大小流畅度

**测试步骤:**
1. 调整窗口大小 5 秒
2. 测量帧率

**预期结果:**
- ✅ 维持 60fps
- ✅ 无明显延迟

---

## 8. 可访问性测试

### 8.1 键盘导航

#### TC-A11Y-001: 窗口聚焦

**测试步骤:**
1. Tab 导航到窗口
2. 验证焦点样式

**预期结果:**
- ✅ Tab 可以聚焦窗口
- ✅ 焦点样式清晰可见

#### TC-A11Y-002: 快捷键

**测试步骤:**
1. 打开窗口
2. 按 Escape 键
3. 验证行为

**预期结果:**
- ✅ Escape 关闭窗口 (如果启用)

#### TC-A11Y-003: 按钮聚焦

**测试步骤:**
1. Tab 导航到窗口控制按钮
2. 验证聚焦顺序

**预期结果:**
- ✅ 按钮聚焦顺序正确
- ✅ 焦点样式清晰

### 8.2 ARIA 属性

#### TC-A11Y-004: 窗口角色

**测试步骤:**
1. 检查窗口 ARIA 属性

**预期结果:**
- ✅ 窗口有 `role="dialog"`
- ✅ 有 `aria-labelledby`
- ✅ 有 `aria-describedby`

#### TC-A11Y-005: 按钮标签

**测试步骤:**
1. 检查按钮 ARIA 标签

**预期结果:**
- ✅ 关闭按钮有 `aria-label="Close"`
- ✅ 最小化按钮有 `aria-label="Minimize"`
- ✅ 最大化按钮有正确的 `aria-label`

---

## 9. 边界条件和错误处理测试

### 9.1 边界条件

#### TC-EDGE-001: 最小尺寸窗口

**测试步骤:**
1. 尝试调整窗口到最小尺寸以下

**预期结果:**
- ✅ 窗口保持最小尺寸
- ✅ 不报错

#### TC-EDGE-002: 最大尺寸窗口

**测试步骤:**
1. 尝试调整窗口到最大尺寸以上

**预期结果:**
- ✅ 窗口保持最大尺寸
- ✅ 不报错

#### TC-EDGE-003: 边界拖拽

**测试步骤:**
1. 尝试拖拽窗口到屏幕外

**预期结果:**
- ✅ 窗口保持部分在屏幕内
- ✅ 边界约束生效

#### TC-EDGE-004: 无效窗口 ID

**测试步骤:**
1. 对不存在的窗口 ID 调用操作

**预期结果:**
- ✅ 操作静默失败
- ✅ 不报错

#### TC-EDGE-005: 空窗口列表

**测试步骤:**
1. 关闭所有窗口
2. 调用各种操作

**预期结果:**
- ✅ 操作正确处理
- ✅ 不报错

### 9.2 错误处理

#### TC-ERR-001: 无效内容类型

**测试步骤:**
1. 传入无效的内容类型

**预期结果:**
- ✅ 显示错误信息
- ✅ 不崩溃

#### TC-ERR-002: iframe 加载失败

**测试步骤:**
1. 加载无效 URL 的 iframe

**预期结果:**
- ✅ 显示加载失败信息
- ✅ 不崩溃

---

## 10. 测试执行计划

### 10.1 执行顺序

```
Phase 1: 单元测试 (P0) → 3.5 小时
  - appWindowStore.test.ts
  - useAppWindow.test.ts
  - useAppWindowManager.test.ts

Phase 2: 组件测试 (P0) → 3 小时
  - AppWindow.test.tsx
  - WindowTitleBar.test.tsx
  - WindowControls.test.tsx
  - WindowResizer.test.tsx
  - ViewRenderer.test.tsx

Phase 3: 集成测试 (P0) → 2 小时
  - ViewReconcilerAdapter.test.ts
  - integration.test.tsx

Phase 4: E2E 测试 (P1) → 2 小时
  - window.spec.ts
  - window-responsive.spec.ts

Phase 5: 性能测试 (P2) → 1 小时

Phase 6: 可访问性测试 (P2) → 1 小时
```

### 10.2 测试命令

```bash
# 运行所有单元测试
npm run test

# 运行特定测试文件
npm run test -- appWindowStore.test.ts

# 运行覆盖率报告
npm run test -- --coverage

# 运行 E2E 测试
npm run test:e2e

# 运行特定 E2E 测试
npm run test:e2e -- window.spec.ts
```

---

## 11. 验收标准

### 11.1 功能验收

- [ ] 所有单元测试通过 (覆盖率 > 80%)
- [ ] 所有组件测试通过
- [ ] 所有集成测试通过
- [ ] 所有 E2E 测试通过
- [ ] 多窗口并发正常
- [ ] 窗口操作完整可用

### 11.2 性能验收

- [ ] 窗口打开时间 < 200ms
- [ ] 拖拽维持 60fps
- [ ] 调整大小维持 60fps
- [ ] 10 个窗口内存增量 < 50MB

### 11.3 可访问性验收

- [ ] 键盘导航完整
- [ ] ARIA 属性正确
- [ ] 焦点样式清晰

### 11.4 兼容性验收

- [ ] Chrome 最新版通过
- [ ] Firefox 最新版通过
- [ ] Safari 最新版通过
- [ ] Edge 最新版通过

---

## 12. 测试文件结构

```
src/
├── store/
│   └── __tests__/
│       └── appWindowStore.test.ts          # Store 单元测试
├── hooks/
│   └── __tests__/
│       ├── useAppWindow.test.ts            # useAppWindow 单元测试
│       └── useAppWindowManager.test.ts     # useAppWindowManager 单元测试
├── components/
│   └── os/
│       └── window/
│           └── __tests__/
│               ├── AppWindow.test.tsx      # AppWindow 组件测试
│               ├── WindowTitleBar.test.tsx # WindowTitleBar 组件测试
│               ├── WindowControls.test.tsx # WindowControls 组件测试
│               ├── WindowResizer.test.tsx  # WindowResizer 组件测试
│               ├── ViewRenderer.test.tsx   # ViewRenderer 组件测试
│               └── integration.test.tsx    # 窗口集成测试
├── services/
│   └── __tests__/
│       └── ViewReconcilerAdapter.test.ts   # ViewReconcilerAdapter 测试
e2e/
├── window.spec.ts                          # 窗口 E2E 测试
└── window-responsive.spec.ts               # 响应式 E2E 测试
```

---

## 13. 风险和缓解措施

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| view-reconciler 集成问题 | 高 | 中 | Mock 依赖进行隔离测试 |
| 多窗口性能问题 | 中 | 低 | 性能测试提前介入 |
| 浏览器兼容性问题 | 中 | 低 | 跨浏览器测试覆盖 |
| 拖拽/调整大小精度问题 | 中 | 中 | 增加边界测试用例 |

---

## 14. 变更历史

| 日期 | 版本 | 变更内容 | 变更人 |
|-----|------|----------|--------|
| 2026-03-13 | v1.0 | 初始测试计划 | QA Engineer |

---

**创建时间**: 2026-03-13
**文档版本**: v1.0
**参考文档**:
- `docs/specs/epic-OS/story-OS.9/architecture.md`
- `docs/specs/epic-OS/story-OS.9/ux-design.md`
- `docs/specs/epic-OS/story-OS.7/test-plan.md`
