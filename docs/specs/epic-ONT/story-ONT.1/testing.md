# ONT.1 测试

## 自动验证

- TypeScript 正例：完整 canonical ontology、状态转换及 Agent/Skill contract 可编译。
- TypeScript 反例：缺少稳定标识或必需引用时编译失败。
- `pnpm --filter @originos/core typecheck`（如 package 未定义则运行仓库既有等价命令）。
- `pnpm lint`。
- `pnpm lint:boundaries`。
- `node scripts/check-architecture-boundaries.cjs --self-test`。

## 回归边界

- 现有旧 ontology 类型调用方无需修改。
- 不产生或修改任何运行数据文件。
