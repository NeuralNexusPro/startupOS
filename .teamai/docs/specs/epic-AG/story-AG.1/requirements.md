# 需求文档 - Story AG.1

**Story:** 死代码与死路径清理
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 用户故事

> 作为 OriginOS 维护者，我需要清除当前仓库中存在的死路径 import、被标 `@deprecated` 但仍被引用的模块、以及没有任何引用方的孤立组件，这样后续的边界修复（AG.2）和迁移（AG.3）才不会在错误的基线上展开。

---

## 验收标准

1. - [ ] `grep -rn "@/lib/collaboration-runtime-bridge" src/` 输出 `0`（不应有任何 import 指向已删除目录）
2. - [ ] `npx tsc --noEmit` 0 error
3. - [ ] `npm test` 通过（基线：与本 Story 开始前的失败数相同或更少）
4. - [ ] `npm run lint` 新增 error 数 = 0
5. - [ ] B-1 二选一明确落定，且与 changelog 记录的方案一致
6. - [ ] 本 Story 涉及的所有删除均通过单 PR 提交（便于回滚），PR 描述含 grep 结果作为证据

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| 删除 `collaboration-runtime-service` 后某个 API route 在 Next.js SSR / Edge Runtime 下 import module 失败 | 在删除前先临时改 1 个 route 验证；失败则降级到 B-1-b 保留壳 |
| `CommandInterface` 实际仍被某 lazy import 引用，grep 漏检 | 删除 PR 中跑 `npm run build`，build fail 即回滚 |
| ts-prune 误报（type-only export 被识别为未使用） | 仅以 ts-prune 为线索，逐条人工确认后再删 |

---

## 相关文档

- [Epic AG README](../README.md) — 当前事实快照
- [Story 9.27 — ARCH-RT-09 deprecated 路径治理](../../epic-9/story-9.27/README.md)
