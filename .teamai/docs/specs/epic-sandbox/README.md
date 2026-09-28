# Epic Sandbox: 前端代码沙箱

## 概述

在 OriginOS 中构建一个代码沙箱，加载并运行由 skill/agent 构建到 `/data` 目录下的前端应用产物，实现隔离预览、控制台观测和安全运行。

## 背景

用户通过 skill（如 `skill-creator-app`）或 agent 构建的前端应用产物已存在于 `/data` 目录下（HTML/CSS/JS 静态文件）。OriginOS 的窗口系统（ViewRenderer）已支持 `iframe` 类型渲染，但只能加载固定 URL。本 Epic 需要：

1. 提供 API 路由，将 `/data` 下的静态文件作为 Web 页面服务
2. 通过 iframe + sandbox 加载这些页面
3. 注入控制台拦截脚本，捕获日志和错误

## 设计目标

1. **加载**: iframe 加载 `/data` 下的静态产物
2. **隔离**: iframe sandbox 属性隔离用户代码
3. **可观测**: 捕获 console 输出和运行时错误
4. **简单**: 无需编译、无需编辑器、无需代码注入

## 技术方案

- **静态服务**: Next.js API route 提供 `/data` 下文件的 HTTP 服务
- **沙箱载体**: iframe + sandbox 属性
- **控制台拦截**: 通过 Next.js middleware/proxy 在静态文件中注入拦截脚本
- **通信**: postMessage 接收沙箱内上报的控制台消息

## 安全模型

| 威胁 | 防护 |
|-----|------|
| 访问父窗口 | sandbox 不包含 allow-top-navigation |
| DOM 污染 | iframe 完全隔离的 DOM 树 |
| Cookie 窃取 | sandbox 不包含 allow-cookies |
| 弹窗骚扰 | sandbox 不包含 allow-popups |

详细架构设计: [architecture.md](architecture.md)

---

## Stories

### Story Sandbox.1: 静态文件服务与沙箱窗口

**优先级**: P0
**状态**: 待实现
**验收标准**:
- [ ] 新增 API route `/api/sandbox/apps` — 列出 `/data` 下所有前端应用产物目录
- [ ] 新增 API route `/api/sandbox/apps/:appId` — 提供单个应用的 index.html 页面
- [ ] 新增 API route `/api/sandbox/apps/:appId/*` — 提供应用下的 CSS/JS/图片等静态资源
- [ ] 在 `index.html` 响应中自动注入控制台拦截脚本
- [ ] 新增 `SandboxWindow` 组件 — 主窗口容器
- [ ] 新增 `SandboxIframe` 组件 — 用 `sandbox` 属性的 iframe 加载 API 返回的页面
- [ ] 新增 `src/types/sandbox.ts` 类型定义

**关键文件**:
- `src/app/api/sandbox/apps/route.ts`
- `src/app/api/sandbox/apps/[appId]/route.ts`
- `src/app/api/sandbox/apps/[appId]/[...path]/route.ts`
- `src/components/sandbox/SandboxWindow.tsx`
- `src/components/sandbox/SandboxIframe.tsx`
- `src/types/sandbox.ts`

### Story Sandbox.2: 控制台输出与错误监控

**优先级**: P1
**状态**: 待实现
**依赖**: Sandbox.1
**验收标准**:
- [ ] 控制台拦截脚本：重写 console.log/warn/error/info，通过 postMessage 上报
- [ ] 全局错误捕获：window.onerror 和 unhandledrejection，通过 postMessage 上报
- [ ] `SandboxConsole` 组件：展示沙箱内的 console 输出，按类型着色
- [ ] `SandboxErrorPanel` 组件：展示运行时错误信息
- [ ] 控制台日志限流（>1000 条截断）
- [ ] 支持按类型筛选日志（all/log/warn/error）

**关键文件**:
- `src/lib/sandbox/console-bridge.ts`
- `src/components/sandbox/SandboxConsole.tsx`
- `src/components/sandbox/SandboxErrorPanel.tsx`

### Story Sandbox.3: Dock 集成与应用管理

**优先级**: P1
**状态**: 待实现
**依赖**: Sandbox.1
**验收标准**:
- [ ] Dock 新增「代码沙箱」内置应用（`appType: 'sandbox'`）
- [ ] 点击 Dock 图标打开 SandboxWindow，展示沙箱应用列表
- [ ] 选择应用后在 iframe 中加载预览
- [ ] `src/config/system-apps.ts` 注册为系统应用

**关键文件**:
- `src/store/dockStore.ts`
- `src/config/system-apps.ts`
- `src/app/page.tsx`（dock action handler 扩展）

### Story Sandbox.4: 安全防护加固

**优先级**: P1
**状态**: 待实现
**依赖**: Sandbox.1
**验收标准**:
- [ ] sandbox 属性正确配置（仅 allow-scripts，明确不含 forms/popups/top-navigation/cookies）
- [ ] API route 拦截用户文件对主站敏感路径的访问（如 `/api/*`, `/_next/*`）
- [ ] API route 设置正确的 Content-Type
- [ ] 编写安全测试用例验证各威胁场景

**关键文件**:
- `src/components/sandbox/SandboxIframe.tsx`
- `src/app/api/sandbox/apps/[appId]/[...path]/route.ts`

---

## 优先级排序

```
Sandbox.1 (静态服务 + 沙箱窗口)
    ↓
Sandbox.2 (控制台/错误) + Sandbox.3 (Dock 集成)  [可并行]
    ↓
Sandbox.4 (安全加固)
```

## Phase 2 规划（不在此 Epic 范围内）

- 实时预览（监听 /data 文件变化自动刷新 iframe）
- WebContainer Node.js 环境
- npm 包管理
- 应用模板市场
