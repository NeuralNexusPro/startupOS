# ONT.7 测试

## 自动验证

- 正例：完整 context snapshot、projection record 与 checkpoint reference 通过 TypeScript 编译。
- 反例：缺少 attemptId、contractHash 或 ontologyVersion 时由 `@ts-expect-error` 验证编译拒绝。
- `pnpm exec tsc -p packages/core/tsconfig.json --noEmit`。
- 显式 `tsc` 编译 ontology 类型样例。
- `pnpm lint`、`pnpm lint:boundaries` 与架构检查器 self-test。
- OpenSpec strict validation 与 `git diff --check`。

## 回归边界

- 不修改 EventStore、运行时状态和持久化文件。
- ONT.1 与旧 ontology 类型继续编译。

## 2026-09-18 验证结果

- core 与显式类型样例编译通过。
- `pnpm lint`：0 error，2983 条既有 warning。
- 架构边界：879 个生产文件 0 诊断，43 个导入用例 × 2 个 CWD 自测通过。
- OpenSpec strict validation 与 `git diff --check` 通过。

## ONT7-T2 验收

- 精确查询：project、ontology/version、context identity、kind、revision 各过滤项均有正反例。
- 隔离：同一 Agent 的不同 task/work item/attempt 不得串线。
- latest：更高 revision 胜出；同 revision 最后追加胜出；返回顺序确定。
- resolver：完整引用返回精确 fact records；缺失、跨版本和 concept/fact type 归属错误均结构化拒绝且无部分结果。
- 只读：成功与失败路径前后的 projection/facts JSONL 内容不变。
- 回归：ONT7-T1 类型样例、store projection round-trip 与 OSDK facts/actions 测试继续通过。
- 命令：core `tsc`、ontology 定向 Vitest、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation、`git diff --check`。

## 2026-09-22 验证结果

- ontology 定向 Vitest：store 与 OSDK 2 files / 15 tests 全部通过。
- `pnpm exec tsc -p packages/core/tsconfig.json --noEmit` 通过。
- `pnpm lint` 通过，0 error；3052 条既有 warning。
- `pnpm lint:boundaries`：901 个生产文件 0 诊断。
- 架构检查器 self-test：43 个导入用例 × 2 个 CWD 通过。
- OpenSpec strict validation 与 `git diff --check` 通过。
