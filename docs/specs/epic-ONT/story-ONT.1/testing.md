# ONT.1 测试

## 自动验证

- TypeScript 正例：完整 canonical ontology、状态转换及 Agent/Skill contract 可编译。
- TypeScript 反例：缺少稳定标识或必需引用时编译失败。
- `pnpm exec tsc -p packages/core/tsconfig.json --noEmit`。
- 显式 `tsc` 编译 `packages/core/src/lib/features/ontology/__tests__/types.test-d.ts`。
- `pnpm lint`。
- `pnpm lint:boundaries`。
- `node scripts/check-architecture-boundaries.cjs --self-test`。

## 回归边界

- 现有旧 ontology 类型调用方无需修改。
- 不产生或修改任何运行数据文件。

## 2026-09-18 验证结果

- core 编译与类型样例编译通过。
- `pnpm lint`：0 error，2983 条既有 warning。
- 架构边界：879 个生产文件，0 条诊断；43 个导入用例 × 2 个 CWD 自测通过。
- OpenSpec strict validation 与 `git diff --check` 通过。
