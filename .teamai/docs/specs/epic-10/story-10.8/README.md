# Story 10.8: Monorepo 容器边界清理 — Web / Desktop / Core 职责分离

**Story 编号:** 10.8
**Epic:** 10 - OriginOS CE 客户端
**优先级:** 🔴 High
**状态:** 📝 Draft（架构审查结果，2026-06-07）
**前置 Story:** 10.7（Monorepo 初始迁移）

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

---

## 🎯 目标架构

```
packages/
├── core/          # 共享代码（UI 组件、features、integrations 公共部分）
├── web/           # Web 版本容器
└── desktop/       # Desktop/Electron 版本容器
```

---

## 📚 文档导航

| 文档 | 内容 |
|------|------|
| [需求规格](./requirements.md) | 架构违规清单、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 实施方案、影响范围 |
