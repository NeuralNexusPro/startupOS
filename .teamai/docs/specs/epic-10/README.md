# Epic 10: OriginOS CE 客户端（Electron Desktop）

**Epic 编号:** 10
**Epic 名称:** OriginOS CE 客户端（Electron Desktop）
**优先级:** 🟡 Medium（Post-MVP，12 个月目标）
**状态:** 📝 Draft
**创建日期:** 2026-06-02

---

## 📋 概述

将 OriginOS 从 Web 应用（Next.js App Router）升级为 Electron 桌面应用，实现真正的 OS 级窗体管理，取代浏览器内模拟的 AppWindowManager。

### 核心目标

| 目标 | 说明 |
|------|------|
| **原生窗体系统** | 用 Electron BrowserWindow 取代 CSS 模拟窗体 |
| **本地文件直连** | 不走 HTTP API，直接访问本地文件系统 |
| **本地 Agent Runtime** | 在本地运行 Agent，不依赖远程服务 |
| **离线能力** | 无网络状态下核心功能可用 |
| **多平台分发** | 支持 macOS / Windows / Linux 打包 |

### 与现有架构的关系

| 层级 | Web 版本 | CE 版本 |
|------|---------|---------|
| **窗体系统** | CSS 模拟（AppWindowManager） | 原生 BrowserWindow |
| **文件系统** | HTTP API（`/api/files/*`） | Node.js fs（IPC） |
| **Agent Runtime** | 远程 HTTP + SSE | 本地子进程 |
| **数据存储** | 服务器本地 JSON | 用户目录 JSON |
| **UI 层** | React（不变） | React（不变） |

**核心原则：** UI 层代码复用，基础设施层适配。

### 双版本并行策略

**浏览器版本和 CE 版本同时保留**，通过环境检测自动切换实现：

```
┌─────────────────────────────────────────────────────────┐
│                    统一 API 抽象层                        │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ useFileSystem()  │  │ useAppWindow()  │              │
│  └────────┬────────┘  └────────┬────────┘              │
│           │                     │                        │
│     ┌─────▼─────┐        ┌─────▼─────┐                 │
│     │ isElectron │        │ isElectron │                 │
│     └─────┬─────┘        └─────┬─────┘                 │
│           │                     │                        │
│  ┌────────▼────────┐  ┌────────▼────────┐              │
│  │  HTTP API 调用   │  │  IPC 调用        │  ← Electron │
│  │  (fetch/axios)  │  │  (ipcRenderer)  │              │
│  └─────────────────┘  └─────────────────┘              │
│           │                     │                        │
│  ┌────────▼────────┐  ┌────────▼────────┐              │
│  │  远程文件系统    │  │  本地文件系统    │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

**环境检测：**
```typescript
// src/lib/integrations/electron/env.ts
export const isElectron = typeof window !== 'undefined' && window.electron !== undefined;
```

**统一 API 示例：**
```typescript
// src/hooks/useFileSystem.ts
import { isElectron } from '@/lib/integrations/electron/env';

export function useFileSystem() {
  if (isElectron) {
    return useLocalFS();  // Electron: IPC 直连
  }
  return useRemoteFS();   // 浏览器: HTTP API
}
```

**双版本构建：**
```bash
npm run dev          # 浏览器版本（Next.js dev server）
npm run electron:dev # CE 版本（Electron + Next.js）
```

---

## 🎯 Story 列表

| Story | 名称 | 优先级 | 状态 |
|-------|------|--------|------|
| 10.1 | Electron 基础框架搭建 | 🔴 High | 📝 Draft |
| 10.2 | 原生窗体系统 — 多窗口管理 | 🔴 High | 📝 Draft |
| 10.3 | 本地文件系统直连 | 🟡 Medium | 📝 Draft |
| 10.4 | 本地 Agent Runtime | 🟡 Medium | 📝 Draft |
| 10.5 | 系统托盘与全局快捷键 | 🟢 Low | 📝 Draft |
| 10.6 | 自动更新与打包分发 | 🟢 Low | 📝 Draft |
| 10.8 | Monorepo 容器边界清理 — Web / Desktop / Core 职责分离 | 🔴 High | 📝 Draft |
| 10.9 | Next.js HTTP API → Electron IPC 服务化迁移 | 🔴 High | 🚧 In Progress |

---

## 🏗️ 技术架构

### 核心架构：Electron + Next.js

```
┌─────────────────────────────────────────────────┐
│                 Electron Shell                   │
│  ┌──────────────────────────────────────────┐   │
│  │           Main Process                    │   │
│  │  ┌─────────────┐  ┌──────────────────┐   │   │
│  │  │ Window Mgr   │  │ Native APIs      │   │   │
│  │  │ (BrowserWin) │  │ (FS/Shell/IPC)   │   │   │
│  │  └─────────────┘  └──────────────────┘   │   │
│  └──────────────────────────────────────────┘   │
│                      ↕ IPC                       │
│  ┌──────────────────────────────────────────┐   │
│  │           Renderer Process                │   │
│  │  ┌──────────────────────────────────┐    │   │
│  │  │     Next.js App (现有代码)        │    │   │
│  │  │  ┌──────────┐ ┌──────────────┐   │    │   │
│  │  │  │ React UI │ │ Agent Runtime│   │    │   │
│  │  │  └──────────┘ └──────────────┘   │    │   │
│  │  └──────────────────────────────────┘    │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 关键技术决策

1. **窗体系统分层：**
   - **原生窗体（Electron BrowserWindow）**：Agent 主窗体、项目窗体、系统设置
   - **应用内窗体（现有 AppWindowManager）**：技能对话、本体编辑器、文件预览等轻量 UI

2. **IPC 通信协议：**
   - Main ↔ Renderer：Electron IPC（`ipcMain` / `ipcRenderer`）
   - Renderer ↔ Agent Runtime：复用现有 HTTP + SSE 协议
   - 保留现有 API 路由兼容性

3. **本地资源访问：**
   - 文件系统：直接 Node.js `fs`（不走 HTTP API）
   - Agent 子进程：本地 spawn（不依赖远程 Runtime）
   - 数据存储：本地 JSON 文件（现有架构）

---

## 📁 关键文件

| 文件 | 用途 |
|------|------|
| `electron/main.ts` | Electron 主进程入口 |
| `electron/preload.ts` | Preload 脚本（暴露 IPC API） |
| `electron/window-manager.ts` | 原生窗体管理器 |
| `electron/ipc-handlers.ts` | IPC 消息处理 |
| `src/lib/integrations/electron/` | Renderer 端 Electron 适配层 |
| `src/hooks/useElectronWindow.ts` | Electron 窗体 Hook |
| `src/store/appWindowStore.ts` | 现有窗体 store（需适配） |

---

## 🧪 验证方式

1. **开发模式验证：**
   ```bash
   npm run electron:dev  # 启动 Electron + Next.js 热重载
   ```

2. **功能验证：**
   - 打开 Agent 窗体 → 验证原生窗口
   - 文件操作 → 验证直连文件系统
   - Agent 会话 → 验证本地 Runtime

3. **打包验证：**
   ```bash
   npm run electron:build  # 生成安装包
   ```

4. **兼容性验证：**
   - 浏览器模式（`npm run dev`）功能不受影响
   - Electron 模式下所有功能正常

---

## 📚 相关文档

- [Epic 9: 多 Agent 协作运行时](../epic-9/README.md)
- [PRD](../../_bmad-output/planning-artifacts/prd.md)
- [架构文档](../../_bmad-output/planning-artifacts/architecture.md)
- [Product Brief](../../_bmad-output/planning-artifacts/product-brief-originos-2026-02-28.md)
