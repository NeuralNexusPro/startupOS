# 需求文档 - Story AG.10

**Story:** 巨型文件拆分 — 单一职责重构
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 用户故事

> 作为 OriginOS 维护者，我需要把 1000+ 行的巨型文件按内聚职责拆为子文件并保持公共 API 不变，这样 review 可以聚焦、修改可以局部化、回归半径可控。

---

## 功能需求

1. **FR-1 拆分对象**：architecture.md 中列出的 7 个目标文件（≥1000 行基线）。
2. **FR-2 符号不变**：拆分后原路径文件保留（re-export 门面）或由 index.ts 承接，全仓调用方 import 零改动；若原文件直接删除，必须同步更新全部调用方并在 PR 中列出。
3. **FR-3 职责单句化**：拆分后每个新文件顶部注释必须能用一句话说明职责；说不清楚即为拆分粒度错误的信号，需重新切。
4. **FR-4 增量交付**：按文件粒度拆 task（AG10-T1…T7），每个 task 独立 PR；顺序按「风险从低到高」：page.tsx → client-hooks.ts → coordinator.ts → composition.ts → agent.ts → contract-execution.ts → supervisor-dag.ts。

---

## 验收标准

1. - [ ] 7 个目标文件全部完成拆分，或单个文件在架构评审后给出「不拆」的书面理由
2. - [ ] 拆分后单文件 ≤ 600 行（架构编排类可放宽至 800 行，需在 PR 说明）
3. - [ ] `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build` 0 error
4. - [ ] `pnpm test` 通过数 ≥ 基线；被拆文件的既有测试文件导入路径不变且全部通过
5. - [ ] `npx madge --circular packages/core/src --extensions ts,tsx` 循环数 ≤ 基线
6. - [ ] 每个 task 拆分后运行对应模块的冒烟（协作会话 / Agent 会话 / 首页加载）

---

## 非目标

- 不做逻辑重写、性能优化、依赖注入改造——只移动代码。
- 不新增抽象层/接口（发现可提取接口时记录到 story 备忘，不在本次实施）。

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| 拆分时顺带「手痒」改逻辑引入回归 | PR review 检查 diff 只含移动+re-export；模块冒烟兜底 |
| 循环导入（拆块互相引用成环） | 每个 task 跑 madge；成环则合并两块或经父级中转 |
| page.tsx 拆分影响 SSR/客户端边界 | 每块保持原 'use client' 标注；`pnpm --filter @originos/web build` 验证 |

---

## 相关文档

- [Epic AG README](../README.md)
