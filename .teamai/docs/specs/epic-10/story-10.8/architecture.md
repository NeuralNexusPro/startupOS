# 架构设计 - Story 10.8

**Story:** Monorepo 容器边界清理 — Web / Desktop / Core 职责分离
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-07

---

## 🔧 实施方案

### Phase 1：紧急修复（不破坏现有功能）

1. **封装 `useAgentLauncher` hook**
   - 位置：`src/hooks/useAgentLauncher.ts`（过渡期放根目录，后迁入 packages/web）
   - 封装 `isElectron()` 判断，统一 agent 打开行为
   - `src/components/os/dock/index.tsx` 和 `src/app/page.tsx` 改用此 hook

2. **Dock 接受 callback prop**（可选，Phase 2）
   - 将 `onAgentOpen` 作为 prop 传入，移除内部 `isElectron()`

### Phase 2：代码迁移

3. **确定 packages/web 迁移路径**
   - 将根目录 `src/` 中未同步到 `packages/web/` 的内容逐步同步
   - `electron:dev` 切换到 `packages/web` 作为 renderer
   - 根目录 `src/` 成为 deprecated 区域

4. **Electron 主进程合并**
   - 将 `/electron/` 整体移入 `packages/desktop/src/main/`
   - 更新 `tsconfig.electron.json` 和构建脚本

### Phase 3：验证

5. `npm run dev` → packages/web 的 Next.js，无平台特定代码
6. `npm run electron:dev` → packages/desktop 主进程 + packages/web renderer
7. 共享组件（Dock、AgentDialogContent 等）在 packages/core 中无平台分支

---

## 📊 影响范围

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/components/os/dock/index.tsx` | Refactor | 移除 isElectron()，改用 callback prop 或 hook |
| `src/app/page.tsx` | Refactor | 移除 isElectron() + createNativeWindow，改用 useAgentLauncher |
| `src/hooks/useAgentLauncher.ts` | New | 平台感知的 agent 打开 hook |
| `packages/web/package.json` | Fix | 移除错误的 `main` 字段 |
| `packages/desktop/src/main/main.ts` | Delete/Merge | 与 /electron/main.ts 合并 |

---

## 🔗 相关文档

- [CLAUDE.md 架构规约 §目录结构规约](../../../../CLAUDE.md)
- [Story 10.7: Monorepo 迁移](../story-10.7/README.md)
- [Epic 10 概述](../README.md)
- [需求规格](./requirements.md) - 用户故事和验收标准
- [返回 Story 概览](./README.md)
