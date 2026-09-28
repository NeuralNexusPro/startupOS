# 架构设计 - Story AG.4

**Story:** 组件分层条款修订（CLAUDE.md 与现实对齐）
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 概述

本 Story 修订 CLAUDE.md 中的组件分层条款，从「atoms / molecules / organisms」抽象分层改为「基础 UI + 按业务域分组」的实用分层，与项目实际组件组织方式对齐。同时新增 Layer 0 `lib/shared/` 定义和模块 UI 豁免条款。

---

## 必做项

- [ ] **A-1** 修订 CLAUDE.md §目录结构规约 — 把 `src/components/` 子树替换为按业务域分组的现实结构
- [ ] **A-2** 修订 CLAUDE.md §UI/UX 规约 — 删除 atoms/molecules/organisms 强制要求条款
- [ ] **A-3** 新增 CLAUDE.md §依赖层级定义 Layer 0：`lib/shared/`（由 AG.2 引入）
- [ ] **A-4** 新增 CLAUDE.md §模块依赖规约 — 关于 `src/modules/**` UI 子目录的豁免与 `ui-deps` 注入约束（由 AG.2 引入的策略写入文档）
- [ ] **A-5** 在 CLAUDE.md §禁止事项清单 中保留「跨业务域组件直接互 import」条款 — 必须通过 `ui/` 或 `lib/features/` 间接共享
- [ ] **A-6** 把 CLAUDE.md 版本号升级为 v2.5.0，更新「最后更新」日期
- [ ] **A-7** 在 `docs/changes/changelog.md` 追加 docs 类型变更记录

---

## 修订内容草稿（条款级）

> 实际写入 CLAUDE.md 时按上下文调整措辞；以下为关键增删点摘要。

### 删除 / 替换

```diff
- ├── components/               # UI 组件
- │   ├── framework/            # 框架组件
- │   ├── molecules/            # 分子组件
- │   ├── organisms/            # 有机组件
- │   ├── os/                   # OS 级组件（workspace 等）
- │   ├── skills/               # 技能组件
- │   ├── ui/                   # 基础 UI 组件
- │   └── window/               # 窗体组件
+ ├── components/               # UI 组件（按业务域分组 + 基础 UI）
+ │   ├── ui/                   # 基础 UI 组件（shadcn 风格，不绑定业务）
+ │   ├── framework/            # 框架级业务组件
+ │   ├── interview/            # 业务域：访谈
+ │   ├── os/                   # 业务域：桌面 OS（workspace, desktop, dock 等）
+ │   ├── project/              # 业务域：项目
+ │   ├── sandbox/              # 业务域：沙箱
+ │   ├── skills/               # 业务域：技能
+ │   ├── solution/             # 业务域：解决方案
+ │   ├── taste/                # 业务域：品味系统
+ │   └── window/               # 业务域：窗体
```

### 新增条款（§组件分层规则）

```markdown
### 组件分层规则

OriginOS 不采用 atoms / molecules / organisms 抽象分层，而采用「基础 UI + 按业务域分组」的实用分层：

1. **基础 UI 层（`src/components/ui/`）**
   - 不绑定业务的视觉原语（基于 shadcn/ui）
   - 可被任意业务域组件、模块 UI 调用
   - 禁止 import `lib/features/*` 或 `lib/integrations/*` 的业务实现

2. **业务域组件层（`src/components/{domain}/`）**
   - 按业务域分组（os / skills / solution / project / sandbox / taste / window / interview / framework）
   - 可依赖：`components/ui/`、`lib/shared/`、`lib/features/`、`lib/hooks/`、`services/`
   - 禁止：跨业务域直接 import 内部组件（必须通过 `ui/` 间接共享，或在 `components/shared/` 抽公共组件）

3. **模块 UI 豁免（`src/modules/{module}/ui/`）**
   - 由 Epic 9 引入的豁免：模块自带 UI 子目录
   - 必须通过 `CollaborationRuntimeUiDeps` 等 ui-deps 接口注入外部 UI 组件
   - 禁止 import `@/components/**` 与 `@/lib/**`（与模块边界规约一致）
```

### 新增条款（§依赖层级定义 Layer 0）

```markdown
Layer 0: lib/shared/             # 共享类型与接口（无运行时实现）
         ↑ 任意层均可依赖
Layer 1: lib/storage/, lib/integrations/, lib/utils/
Layer 2: lib/features/, modules/
Layer 3: services/
Layer 4: components/
Layer 5: app/
```

`lib/shared/` 规则：
- 仅 `.ts` 类型与接口定义，禁止实现 / 类与函数体 / React 运行时依赖
- 可被任意层 import；本身不 import 任何上层
- 用于打破跨层耦合（特别是 module ↔ lib/integrations 的类型共享）
