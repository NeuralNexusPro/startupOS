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
