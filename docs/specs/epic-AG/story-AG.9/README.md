# Story AG.9: core 包治理 — 公共 API 收缩与定位如实化

**Epic:** AG — 架构治理与围栏对齐
**状态:** 📋 Planning
**优先级:** 🔴 Critical（公共 API 遵守率当前为 0，core 实质是「任意深度可 import 的目录」）
**估计工时:** 3–5 天
**依赖:** 建议在 AG.8（包边界迁移）完成后启动——迁移后所有跨包导入都已走 `@originos/core/...` 说明符，收缩 exports 才不会同时面对两套导入形态
**创建日期:** 2026-09-28
**规约依据:** AGENTS.md v2.6.3 依赖规约（feature 必须通过 index.ts 导出公共 API）+ 禁止事项 #10

---

## 概述

当前 core 的公共 API 已名存实亡：

- `packages/core/src/index.ts` 只导出 storage/utils/types；`@originos/core` 根导入在 web+desktop 中为 **0 次**。
- 深路径导入 `@originos/core/lib/...` 共 **243+ 处**。
- `packages/core/package.json` 的 `exports` 有 **80+ 条通配符**（`./lib/features/*`、`./lib/integrations/*/*`、`./modules/*/*` 等），等于声明「core 内部任何文件都是公共 API」。

本 Story 做两件事：

1. **定位如实化**：在 AGENTS.md 与 core README 中承认 core 是「共享 TypeScript 运行时（含 React 组件与 zustand store）」，删除「纯逻辑 core」的失真描述；清理 core 内 `.jsx` 无类型副本（7 组，为初始提交遗留的 strip-types 产物，无任何引用方）。
2. **exports 收缩**：把 80+ 条通配符逐类收敛——每个 feature/integration/module 收口到显式子路径白名单，深层文件导入迁移到 feature `index.ts` 门面导出。

## 文档导航

| 文档 | 内容 |
|------|------|
| [requirements.md](./requirements.md) | 用户故事、验收标准、风险与回滚 |
| [architecture.md](./architecture.md) | exports 收缩分类、门面补齐策略、jsx 清理 |
| [testing.md](./testing.md) | 测试策略、验收测试用例 |

## 状态

- [ ] 需求确认
- [ ] 架构设计
- [ ] 开发实施
- [ ] 测试验证
