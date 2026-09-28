# 需求 - Story 10.8

**Story:** Monorepo 容器边界清理 — Web / Desktop / Core 职责分离
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-07

---

## 📋 背景与问题陈述

Story 10.7 完成了 Monorepo 骨架搭建（`packages/core`、`packages/web`、`packages/desktop`），但**实际开发仍在根目录 `src/` 进行**，三个 packages 与根目录之间的职责边界未落实，导致以下系统性问题。

### 当前实际状态（审查截至 2026-06-07）

| 位置 | 状态 | 问题 |
|------|------|------|
| 根目录 `src/` | ✅ 主力开发区（581 TS/TSX 文件） | 不应作为长期归属 |
| `packages/web/src/` | ⚠️ 独立副本，已与根目录分化（296 文件） | 缺失 `/agent/[agentId]` 路由，与根目录不同步 |
| `packages/desktop/src/main/` | ⚠️ 与 `/electron/main.ts` 几乎完全重复 | 双份 Electron 主进程 |
| `packages/core/src/` | ✅ 共享库，结构正确 | 无问题 |
| `/electron/` | ✅ 主力 Electron 主进程 | `electron:dev` 实际使用此处 |

### `electron:dev` 实际链路

```
npm run electron:dev
  ├── next dev          → 根目录 src/app （不是 packages/web）
  ├── tsc watch         → /electron/ → dist-electron/main.js
  └── electron dist-electron/main.js → 加载 localhost:3000（根目录 Next.js）
```

---

## 🚨 架构违规清单

### 违规 1：平台分支逻辑混入共享组件（高危）

**文件：** `src/components/os/dock/index.tsx`（及 `packages/web/src/components/os/dock/index.tsx`）

```typescript
// ❌ 错误：共享 UI 组件内嵌 isElectron() 分支
if (isElectron()) {
  electronWindow.createWindow({ route: `/agent/${app.id}` });
} else {
  openWindow({ content: { type: 'component', component: AgentDialogContent } });
}
```

**为什么违规：** Dock 是共享 UI 组件，不应感知运行平台。平台路由决策属于"容器层"（web 容器 or desktop 容器），不属于"组件层"。

**正确模式：**
```typescript
// ✅ 正确：Dock 组件接收平台无关回调
interface DockProps {
  onAgentOpen: (agentId: string, agentName: string) => void;
}

// packages/web 容器层注入 Web 实现
<Dock onAgentOpen={(id, name) => AppWindowManager.openComponentWindow(...)} />

// packages/desktop 容器层注入 Electron 实现  
<Dock onAgentOpen={(id, name) => createNativeWindow({ route: `/agent/${id}` })} />
```

---

### 违规 2：`page.tsx` 内嵌平台分支（高危）

**文件：** `src/app/page.tsx`（根目录主页）

```typescript
// ❌ 错误：页面层直接调用 isElectron() + createNativeWindow
if (isElectron()) {
  void createNativeWindow({ route: `/agent/${agent.id}` });
} else {
  AppWindowManager.openComponentWindow(...);
}
```

**为什么违规：** `page.tsx` 是渲染逻辑，不是容器逻辑。平台判断应由统一的 `useAgentLauncher()` hook 封装。

**正确模式：**
```typescript
// ✅ 封装为平台感知 hook（放在 packages/web 或 packages/desktop）
const { openAgent } = useAgentLauncher();
// Web 实现：openAgent → AppWindowManager
// Desktop 实现：openAgent → createNativeWindow
```

---

### 违规 3：根目录 `src/` 不应是长期开发主区（中危）

**现状：** `electron:dev` 的 Next.js renderer 是根目录 `src/app`，而 `packages/web/src/app` 是分化的副本（未同步 `/agent/[agentId]` 路由等改动）。

**问题：**
- 开发者不清楚改 `src/` 还是 `packages/web/src/`
- `packages/web/` 存在但不运行，失去了架构上的意义
- 双份相近代码造成维护成本翻倍

---

### 违规 4：Electron 主进程双份（低危）

| 文件 | 状态 |
|------|------|
| `/electron/main.ts` | ✅ 主力，`electron:dev` 使用 |
| `packages/desktop/src/main/main.ts` | ⚠️ 几乎相同，不在主链路，可能过时 |

---

### 违规 5：`packages/web/package.json` 指向错误的 main（低危）

```json
// packages/web/package.json
"main": "../../dist-electron/main.js"  // ❌ web 包不应指向 Electron 入口
```

---

## 🎯 目标架构

```
packages/
├── core/          # 共享代码（UI 组件、features、integrations 公共部分）
│   └── src/
│       ├── components/os/dock/     ← Dock 接受 onAgentOpen callback，无平台判断
│       └── lib/integrations/electron/  ← 仅类型定义和底层 bridge，无业务逻辑
│
├── web/           # Web 版本容器
│   └── src/
│       ├── app/                    ← Next.js App Router（Web 专属页面和 API）
│       ├── providers/              ← 注入 Web 版实现（AppWindowManager）
│       └── containers/             ← 包装 core 组件，注入 web 平台回调
│           └── DockContainer.tsx   ← <Dock onAgentOpen={webHandler} />
│
└── desktop/       # Desktop/Electron 版本容器
    └── src/
        ├── main/                   ← Electron 主进程（window-manager、IPC）
        ├── preload/                ← Preload 脚本
        ├── renderer/               ← 渲染进程容器层
        │   └── containers/
        │       └── DockContainer.tsx  ← <Dock onAgentOpen={electronHandler} />
        └── lib/integrations/       ← Desktop 专属 API 适配
```

---

## ✅ 验收标准

### AC1：Dock 组件平台无关化
- `packages/core/src/components/os/dock/index.tsx` 中**无 `isElectron()` 调用**
- Dock 通过 `onAgentOpen(agentId, agentName)` callback 委托平台行为
- Web 容器和 Desktop 容器各自注入对应实现

### AC2：`page.tsx` 无平台分支
- `src/app/page.tsx`（或迁移后的 `packages/web/src/app/page.tsx`）中**无 `isElectron()` + `createNativeWindow` 调用**
- 统一通过 `useAgentLauncher()` 或 Provider 模式委托

### AC3：明确单一开发主区
- 确定 `src/` 迁移到 `packages/web/` 的时间节点和路径
- 或明确 `src/` 作为 legacy 过渡区，`packages/web/` 作为新功能目标区
- `packages/web/` 与根目录 `src/` 的分化差异记录清楚

### AC4：Electron 主进程归一
- `/electron/main.ts` 与 `packages/desktop/src/main/main.ts` 合并为一份
- `packages/desktop` 的 `pnpm dev` 使用 `packages/web` 作为 renderer（而非根目录）

### AC5：`packages/web/package.json` 修正
- 移除错误的 `"main": "../../dist-electron/main.js"`

---

## 🔗 依赖关系

- 前置 Story: 10.7（Monorepo 初始迁移）

---

## 📚 相关文档

- [架构设计](./architecture.md) - 技术实现方案
- [返回 Story 概览](./README.md)
