# 架构设计 - Story AG.9

**Story:** core 包治理 — 公共 API 收缩与定位如实化
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 概述

exports 收缩按「先显式化、再收口」两步：先把每条通配符替换为该通配当前实际命中的显式条目（零行为变化的机械展开），再按调用方热度把深路径导入逐步迁到 feature 门面。

## 必做项

### A：通配符显式化（零行为变化）

- [ ] **A-1** 写一次性脚本 `scripts/expand-core-exports.cjs`：扫描 web/desktop/插件源码中所有 `@originos/core/<spec>` 导入说明符，逐条与 exports 通配模式匹配，输出「实际命中的显式条目集」；合并当前 exports 中已被显式列出的条目，生成新 exports。
- [ ] **A-2** 分批替换（每批一个 commit，便于二分回滚）：
  1. `./lib/features/*` 及其子通配（约 30 条）→ 显式 feature 门面 + types + 现有深路径
  2. `./lib/integrations/*`（约 20 条）→ 同上
  3. `./modules/*`（约 25 条）→ 同上
  4. `./lib/shared/*`、`./lib/hooks/*`、`./lib/storage/*` → 同上
- [ ] **A-3** 每批后运行 TC-3（双端编译）+ TC-4（打包冒烟）。

### B：feature 门面补齐与深路径收口

- [ ] **B-1** 统计深路径导入热度（web+desktop 中 `@originos/core/lib|modules/<x>/<y>/<z>` 出现次数排序），top 10 的目标文件优先补入门面。
- [ ] **B-2** 门面补齐规则：符号加进 feature `index.ts` → 调用方改 `@originos/core/lib/features/<name>` → 深路径白名单条目删除。禁止门面 re-export 整个内部文件（`export * from './store'` 整文件级允许，但必须与 index.ts 其余导出无冲突且通过循环检查）。
- [ ] **B-3** 已知热点（2026-09-28 扫描）：`@originos/core/lib/integrations/electron/*`（web page.tsx 等 8+ 处）、`@originos/core/lib/integrations/pi-agent/client`、`@originos/core/lib/features/agent/server`（desktop main.ts）。electron 集成层考虑建立 `lib/integrations/electron/index.ts` 门面。

### C：定位如实化

- [ ] **C-1** 新建 `packages/core/README.md`：声明 core = 共享 TS 运行时（业务 features + 集成 + 模块 + React hooks + zustand store + 模块内 UI），列出 Layer 边界与 exports 白名单即公共 API 的事实。
- [ ] **C-2** AGENTS.md 目录结构章节中 `packages/core` 段落的 `components/` 注释与 hooks 描述核对现实（`core/src/components/` 不存在——删除该行或改为实际结构）；「core/src/lib/hooks/」已在树中，补注「含 zustand store」。

### D：死代码清理

- [ ] **D-1** 删除 7 组 `.jsx` 副本（清单见 requirements FR-4），`git grep "\.jsx'"` 确认零引用后删除。
- [ ] **D-2** web 壳目录清理（FR-5）：
  - `grep -rn "@/lib/features/culture" packages/web/src` → 引用方改 `@originos/core/lib/features/culture/...` → 删 `packages/web/src/lib/features/culture/`
  - `packages/web/src/app/api/ontology-data/instances/route.ts:53` 动态导入改 `@originos/core/lib/features/ontology-data-store/store`（该路径已在 exports 显式条目中）→ 删 `packages/web/src/lib/features/ontology-data-store/`

## 技术细节

### exports 目标形态示例（feature 段）

```jsonc
{
  // 门面（每个 feature 必有）
  "./lib/features/ontology": "./src/lib/features/ontology/index.ts",
  "./lib/features/ontology/types": "./src/lib/features/ontology/types.ts",
  // 现存合法深路径（显式列举，逐步收敛减少）
  "./lib/features/ontology-data-store/config": "./src/lib/features/ontology-data-store/config.ts",
  // ...
}
```

### 基线数据（2026-09-28）

- exports 总条目：84（含通配 ~40 条）
- `@originos/core` 根导入：0；深路径导入：243+
- jsx 副本：7 组 / 14 文件
- web 壳目录：culture（3 文件）、ontology-data-store（1 文件）
