# Epic-OS: Phase 0 OS 交互基础

**Epic 编号:** OS
**Epic 名称:** Phase 0 OS 交互基础
**优先级:** 🔴 Critical (构建原生 OS 体验的基础)
**状态:** Planning
**负责人:** PM
**开始日期:** 2026-03-07
**预计时长:** 3 周 (Week 1-3)

---

## 📋 Epic 描述

构建 OriginOS 的原生操作系统交互框架，通过空间框架、动画系统和 Agent 托管，从"Web 应用"向"原生 OS"体验转变。

### 核心问题

当前 OriginOS 的体验像 SaaS 应用：
- 对话界面（CUI）过于中心化
- 缺乏原生操作系统的沉浸感
- 没有桌面/工作区的空间感
- 缺少类似 Spotlight 的全局命令体验

### 解决方案

采用 Fluent-OS 和 macOS HIG 设计启发：
1. **空间框架（A）** - Desktop 空间 + Dock 任务栏
2. **动画系统（D）** - Acrylic 材质 + Fluent 动画
3. **Agent 托管（F）** - Agent 对象系统 + 托管服务

---

## 🎯 Epic 目标

### 核心目标

1. **原生 OS 空间感** - 创建 Desktop 空间容器，提供工作区概念
2. **流畅动画体验** - 实现 Acrylic 材质和 Fluent 动画系统
3. **Agent 托管系统** - Agent 作为可拖拽、可控制的系统对象
4. **全局命令中心** - Spotlight 风格的全局搜索/命令入口

### 成功标准

- ✅ Desktop 空间可运行，响应式布局
- ✅ Dock 任务栏可显示应用和 Agent 状态
- ✅ Acrylic 材质样式可应用于对话窗口
- ✅ Spotlight 全局命令可通过快捷键触发
- ✅ Agent 可在桌面空间中作为对象存在
- ✅ 动画帧率稳定（60fps）
- ✅ 响应式支持（桌面/平板）

---

## 📝 Stories 列表（Week 1-4）

| Story | 标题 | 状态 | 优先级 | 调度 | 工时 |
|-------|------|------|--------|-----|------|
| OS.1 | Desktop 空间框架 | ✅ Complete | Critical | Week 1 Days 1-4 | 3-4 天 |
| OS.2 | Dock 任务栏基础 | ✅ Complete | Critical | Week 1 Days 5-6 | 2 天 |
| OS.3 | Agent 对象定义 | ✅ Complete | Critical | Week 1 Days 7-10 | 3 天 |
| OS.4 | Spotlight 全局命令 | ✅ Complete | High | Week 2 Days 1-4 | 3-4 天 |
| OS.5 | Acrylic 材质系统 | ✅ Complete | High | Week 2 Days 5-7 | 2-3 天 |
| OS.6 | Fluent 动画系统 | ✅ Complete | High | Week 2 Days 8-10 | 2 天 |
| OS.7 | Agent 托管服务 | ✅ Complete | High | Week 3 Days 1-5 | 4-5 天 |
| OS.8 | 系统集成与优化 | ✅ Complete | Medium | Week 3 Days 6-10 | 4 天 |
| OS.9 | 应用窗口系统 | ✅ Complete | High | Week 4 Days 1-6 | 5-6 天 |
| OS.10 | 系统工具语义说明加固（Tool Schema Description Hardening） | 📋 Planning | High | TBD | 2-3 天 |
| OS.11 | 窗体类型元数据统一注册系统（Window Type Registry） | 📋 Planning | High | TBD | 1-2 天 |
| OS.12 | 系统级 Office 文件读取能力（Word / Excel / CSV） | 📋 Planning | High | TBD | 3-5 天 |
| OS.13 | 统一 Agent 记忆使用路径并移除 Dream 主路径 | 📋 Planning | High | TBD | 4-6 天 |
| OS.14 | Agent Runtime 工作目录与输出目录边界收敛 | ✅ Complete | High | 2026-06-29 | 1-2 天 |
| OS.15 | 桌面应用自动更新机制 | 📋 Planning | High | TBD | 4-6 天 |
| OS.16 | 系统级定时任务与定时唤起能力 | 📋 Planning | High | TBD | 4-6 天 |
| OS.17 | 无项目首页与 Agent 思考内容显示优化 | 📋 Planning | High | 2026-07-22 | 1-2 天 |
| OS.18 | Windows 内置模板技能加载修复 | ✅ Complete | High | 2026-07-23 | 1-2 天 |
| OS.19 | Skill、Agent 与 RoleAgent 目录导出 ZIP | ✅ Complete | High | 2026-07-26 | 1-2 天 |
| OS.20 | 窗体会话历史切换与上下文恢复 | ✅ Done | High | Agent Runtime / Desktop UX | 2-3 天 |
| OS.21 | 统一系统调度运行时与后台周期任务 | 📋 Planning | High | System Runtime | 3-5 天 |
| OS.22 | 统一 Agent Channel 消息入口与多 Runtime 双工输出协议 | 📋 Planning | Critical | Agent / Project / Collaboration Runtime | 5-8 天 |

---

## 🎯 Story 详情

### Story OS.1: Desktop 空间框架 (Week 1, Days 1-4)

**状态:** Planning
**优先级:** Critical
**依赖:** Epic 0 (pi-agent-core 基础设施)
**估计工时:** 3-4 天

#### 用户故事

> 作为用户，我希望进入 OriginOS 时看到一个类似原生操作系统的桌面空间，这样我能感受到这是一个操作系统而不是 Web 应用。

#### 功能需求

- **Desktop 容器组件**：固定全屏布局
- **背景系统**：支持背景色、背景图片、粒子效果
- **图标网格**：桌面图标可拖拽排列
- **响应式布局**：适配桌面/平板尺寸
- **状态栏**：顶部时间、网络状态显示

#### 技术需求

```typescript
// 核心组件结构
components/os/Desktop.tsx          // Desktop 空间容器
components/os/StatusBar.tsx       // 状态栏
components/os/DesktopIcon.tsx     // 桌面图标
hooks/useDesktopGrid.ts           // 图标网格逻辑
```

#### 验收标准

- [ ] Desktop 组件占满全屏
- [ ] 状态栏显示正确（时间、网络图标）
- [ ] 桌面图标可拖拽排列
- [ ] 响应式布局正常（1920x1080, 1366x768, 768x1024）
- [ ] 背景效果可配置

---

### Story OS.2: Dock 任务栏基础 (Week 1, Days 5-6)

**状态:** Planning
**优先级:** Critical
**依赖:** OS.1 (Desktop 空间)
**估计工时:** 2 天

#### 用户故事

> 作为用户，我希望底部有一个类似 macOS Dock 的任务栏，能快速访问应用和看到运行状态。

#### 功能需求

- **Dock 容器**：固定底部居中
- **App 图标**：列出已安装应用
- **运行状态**：运行中的应用有指示灯
- **右键菜单**：应用快捷操作
- **拖拽排序**：支持图标顺序调整

#### 技术需求

```typescript
// 核心组件结构
components/os/Dock.tsx            // Dock 容器
components/os/DockIcon.tsx        // Dock 图标
components/os/DockMenu.tsx        // 右键菜单
hooks/useDockState.ts             // Dock 状态管理
```

#### 验收标准

- [ ] Dock 固定在底部居中
- [ ] 显示至少 4 个应用图标
- [ ] 运行中的应用有指示灯（圆点）
- [ ] 右键菜单弹出正确
- [ ] 图标可拖拽排序

---

### Story OS.3: Agent 对象定义 (Week 1, Days 7-10)

**状态:** Planning
**优先级:** Critical
**依赖:** OS.2 (Dock 任务栏)
**估计工时:** 3 天

#### 用户故事

> 作为系统，我希望将 Agent 定义为可托管的系统对象，这样它们能在桌面空间中显示和交互。

#### 功能需求

- **Agent 数据模型**：定义 Agent 元数据（ID、名称、图标、状态）
- **Agent 注册系统**：Agent 可注册到系统
- **Agent 类型系统**：区分不同 Agent 类型（架构师、开发者、QA 等）
- **Agent 状态管理**：运行中、空闲、暂停状态

#### 技术需求

```typescript
// 核心数据结构
types/agent.ts                    // Agent 类型定义
lib/os/agent-registry.ts          // Agent 注册表
lib/os/agent-state-manager.ts     // Agent 状态管理
```

```typescript
// Agent 对象结构
interface AgentObject {
  id: string;
  name: string;
  icon: string;
  type: 'pm' | 'architect' | 'developer' | 'qa' | 'ux-designer';
  status: 'idle' | 'running' | 'paused' | 'error';
  capabilities: string[];
  metadata?: Record<string, any>;
}
```

#### 验收标准

- [ ] Agent 数据模型定义完整
- [ ] Agent 注册系统可用
- [ ] 至少 5 种 Agent 类型定义
- [ ] 状态管理正确切换

---

### Story OS.4: Spotlight 全局命令 (Week 2, Days 1-4)

**状态:** Planning
**优先级:** High
**依赖:** OS.1 (Desktop 空间)
**估计工时:** 3-4 天

#### 用户故事

> 作为用户，我希望通过快捷键快速打开全局命令面板，这样我能快速搜索和启动功能。

#### 功能需求

- **快捷键触发**：Cmd/Ctrl + K 打开/关闭
- **搜索框**：顶部聚焦，实时搜索
- **结果列表**：显示匹配的应用、命令、Agent
- **键盘导航**：方向键选择，Enter 执行
- **模糊搜索**：支持部分匹配

#### 技术需求

```typescript
// 核心组件结构
components/os/Spotlight.tsx       // Spotlight 容器
components/os/SearchField.tsx     // 搜索框
components/os/SearchResults.tsx   // 结果列表
hooks/useSpotlightShortcuts.ts    // 快捷键钩子
hooks/useFuzzySearch.ts           // 模糊搜索钩子
```

#### 验收标准

- [ ] Cmd/Ctrl + K 快捷键可打开/关闭
- [ ] 搜索框自动聚焦
- [ ] 搜索结果实时更新
- [ ] 键盘导航可用（方向键、Enter）
- [ ] 模糊搜索正确匹配

---

### Story OS.5: Acrylic 材质系统 (Week 2, Days 5-7)

**状态:** Planning
**优先级:** High
**依赖:** 无
**估计工时:** 2-3 天

#### 用户故事

> 作为用户，我希望界面有玻璃态的半透明效果，这样我能感受到现代操作系统的质感。

#### 功能需求

- **Acrylic 样式类**：统一的玻璃态样式
- **模糊效果**：backdrop-filter 模糊效果
- **半透明背景**：rgba 带透明度
- **光影效果**：边框光晕和阴影
- **可复用组件**：AcrylicDialog/AcrylicPanel

#### 技术需求

```css
/* 核心 Acrylic 样式 */
.acrylic {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.floating-panel {
  @extend .acrylic;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}
```

```typescript
// 核心组件结构
components/ui/AcrylicDialog.tsx   // Acrylic 对话框
components/ui/AcrylicPanel.tsx    // Acrylic 面板
styles/acrylic.css                // Acrylic 样式文件
```

#### 验收标准

- [ ] AcrylicDialog 组件可用
- [ ] AcrylicPanel 组件可用
- [ ] 模糊效果可见
- [ ] 半透明背景正确
- [ ] 光影效果流畅

---

### Story OS.6: Fluent 动画系统 (Week 2, Days 8-10)

**状态:** Planning
**优先级:** High
**依赖:** OS.5 (Acrylic 材质)
**估计工时:** 2 天

#### 用户故事

> 作为用户，我希望界面元素过渡有流畅的动画效果，这样操作感觉更自然。

#### 功能需求

- **缓动函数**：非线性的有生命的缓动
- **微交互**：按钮悬停反馈
- **转场动画**：界面切换过渡
- **动画钩子**：useAnimation/useSpring

#### 技术需求

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
```

```typescript
// 动画钩子
hooks/useAnimation.ts              // 动画控制
hooks/useSpring.ts                 // 弹簧动画
```

#### 验收标准

- [ ] 动画流畅（60fps）
- [ ] 缓动函数正确应用
- [ ] 悬停动画响应迅速
- [ ] 转场过渡平滑

---

### Story OS.7: Agent 托管服务 (Week 3, Days 1-5)

**状态:** Planning
**优先级:** High
**依赖:** OS.3 (Agent 对象定义)
**估计工时:** 4-5 天

#### 用户故事

> 作为用户，我希望 Agent 能在桌面空间中显示，点击可以打开对话窗口。

#### 功能需求

- **Agent 渲染服务**：Agent 在桌面/Dock 中渲染
- **Agent 启动器**：点击 Agent 打开对话窗口
- **Agent 状态同步**：Agent 状态实时更新
- **多 Agent 支持**：可同时打开多个 Agent 对话

#### 技术需求

```typescript
// 核心服务结构
services/agent-factory.ts          // Agent 工厂（创建 Agent 实例）
services/agent-host.ts             // Agent 托管服务
hooks/useAgentLauncher.ts          // Agent 启动钩子

// 对话窗口集成
components/os/AgentDialog.tsx      // Agent 对话窗口（使用 Acrylic）
```

#### 验收标准

- [ ] Agent 在 Dock 中显示
- [ ] 点击 Agent 打开对话窗口
- [ ] Agent 状态正确同步
- [ ] 可同时打开多个 Agent
- [ ] 对话窗口使用 Acrylic 材质

---

### Story OS.8: 系统集成与优化 (Week 3, Days 6-10)

**状态:** Planning
**优先级:** Medium
**依赖:** OS.1-OS.7 (所有前置 Stories)
**估计工时:** 4 天

#### 用户故事

> 作为用户，我希望整个 OS 交互框架流畅稳定，没有明显的延迟和卡顿。

#### 功能需求

- **性能优化**：减少重绘、优化渲染
- **响应式测试**：在不同屏幕尺寸下测试
- **浏览器兼容**：Chrome/Safari/Firefox 测试
- **错误处理**：优雅的错误提示和恢复
- **可访问性**：键盘导航、屏幕阅读器支持

#### 技术需求

```typescript
// 优化任务
- React.memo 使用优化
- 虚拟化长列表
- 懒加载组件
- 去抖/节流事件处理
- 性能监控（FPS、内存）
```

#### 验收标准

- [ ] 动画帧率稳定 60fps
- [ ] 页面加载时间 < 2s
- [ ] 响应式布局正常（3 种尺寸）
- [ ] 浏览器兼容性通过
- [ ] 无明显内存泄漏

---

## 🔗 依赖关系

### 前置依赖

| 依赖内容 | 来源 Epic | 状态 |
|---------|----------|------|
| pi-agent-core 集成 | Epic 0 | ✅ Complete |
| CUI 交互层 | Epic 0 | ✅ Complete |
| 工具调用系统 | Epic 0 | ✅ Complete |

### Story 依赖

```
Week 1:
OS.1 (Desktop) ─────┐
OS.2 (Dock)   <─────┤
OS.3 (Agent)   <────┤

Week 2:
OS.4 (Spotlight) ← OS.1
OS.5 (Acrylic)  ← (独立)
OS.6 (Animation) ← OS.5

Week 3:
OS.7 (Agent Host) ← OS.3 + OS.5
OS.8 (Integration) ← (所有前置)

Post Week 4:
OS.9 (App Window) ← OS.8
OS.10 (Tool Schema) ← OS.7
OS.11 (Window Registry) ← OS.9
OS.12 (Office Reader) ← OS.7 + OS.10
```

### 后续影响

| 影响模块 | 说明 |
|---------|-----|
| Epic C (Phase 1 认知) | 文化检测对话可使用 Acrylic 窗口 |
| Epic 1 (项目访谈) | 项目创建应用可集成到 Dock/Spotlight |
| 未来应用 | 所有应用可使用 OS 框架 |

---

## 📊 验收标准

### Epic 级别验收标准

- [x] Stories OS.1-OS.8 全部完成
- [x] Desktop 空间响应式布局正常
- [x] Dock 任务栏交互流畅
- [x] Spotlight 全局命令可用
- [x] Acrylic 材质样式正确
- [x] 动画系统 60fps 稳定
- [x] Agent 托管服务可用
- [x] 性能测试通过
- [x] 浏览器兼容性通过
- [x] Story OS.9 应用窗口系统完成

### 用户体验验收

- [x] 打开 OriginOS 感觉像原生 OS
- [x] 界面动画流畅自然
- [x] Agent 交互直观易用
- [x] Spotlight 搜索快速准确
- [x] 整体体验"不像 Web 应用"

---

## 🚨 关键约束与决策

### 设计原则

| 原则 | 实施方式 |
|-----|---------|
| **原生 OS 感** | Desktop + Dock + Spotlight |
| **Fluent 风格** | Acrylic + Fluent 动画 |
| **响应式** | 桌面/平板两种布局模式 |
| **性能优先** | 60fps 稳定，< 2s 加载 |

### 技术决策

| 决策 | 内容 |
|-----|------|
| **CSS 方案** | CSS Modules + Tailwind |
| **动画库** | CSS transitions + Framer Motion（如需要） |
| **状态管理** | Zustand（轻量级） |
| **组件库** | 创建自己的 Acrylic 组件（不依赖重型库） |

---

## 📚 相关文档

### Epic 文档
- **本 Epic**：`docs/specs/epic-OS/README.md`
- **Story 子文档**：
  - `docs/specs/epic-OS/story-OS.1/{README,requirements,interaction,architecture,testing}.md`
  - ...
  - `docs/specs/epic-OS/story-OS.10/README.md`
  - `docs/specs/epic-OS/story-OS.11/README.md`
  - `docs/specs/epic-OS/story-OS.12/README.md`
  - `docs/specs/epic-OS/story-OS.16/README.md`

### 上游文档
- [OS 框架设计](../../design/os-framework.md) - Fluent OS 参考设计
- [交互设计改进](../../ux/design/os-interaction-redesign.md) - macOS HIG 启发
- [PRD v2.0](../../product/PRD-Main.md) - 产品需求

### 参考资源
- [Fluent Design System](https://fluent2.microsoft.design/)
- [macOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/macos)

---

## 📅 Week 1-3 调度总结

| Week | Stories | 天数 |
|-----|---------|-----|
| **Week 1** | OS.1 (4 天) + OS.2 (2 天) + OS.3 (3 天) | 9 (可并行) |
| **Week 2** | OS.4 (4 天) + OS.5 (3 天) + OS.6 (2 天) | 9 (可并行) |
| **Week 3** | OS.7 (5 天) + OS.8 (4 天) | 9 (可并行) |

**总计: 约 15 个工作日 (3 周)**

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|-----|---------|-------|
| 2026-03-07 | Epic-OS 初始化 - 基于 OS 框架设计 + 交互设计文档 | PM |

---

## 🎯 下一步行动

1. **Team Lead 批准** - 等待对 Epic-OS 和 Stories 的最终批准
2. **创建 Story 文档** - 为每个 Story 创建完整的子文档
3. **UX 设计** - 创建 Figma 原型（Desktop、Dock、Spotlight）
4. **Developer 开始** - Week 1 开始 Story OS.1 实现

---

**等待批准后开始开发**
