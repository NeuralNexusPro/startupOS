# ONT.7 测试

## ONT7-T1 自动验证

- 正例：完整 context snapshot、projection record 与 checkpoint reference 通过 TypeScript 编译。
- 反例：缺少 attemptId、contractHash 或 ontologyVersion 时由 `@ts-expect-error` 验证编译拒绝。
- `pnpm exec tsc -p packages/core/tsconfig.json --noEmit`。
- 显式 `tsc` 编译 ontology 类型样例。
- `pnpm lint`、`pnpm lint:boundaries` 与架构检查器 self-test。
- OpenSpec strict validation 与 `git diff --check`。

## ONT7-T2 用例

在 `packages/core/src/lib/features/ontology/__tests__/ontology-osdk.test.ts` 增加一个聚合测试组：

1. 合法 projection append 后可查询，`createdAt` 恢复为 `Date`。
2. project 不一致、当前 ontology id/version、引用绑定/存在性/重复或 revision 非法时返回对应 issue，且 projection 文件零新增；不安全 project 标识保持既有 `TypeError`。
3. context/attempt 为空时返回 `INVALID_CONTEXT_IDENTITY`；有效值严格隔离，kind/revision 精确过滤，结果保持追加顺序。
4. 同一 project 内，同 id + 同规范化完整记录的并发重试只保留一条；改变 `createdAt` 或其他内容返回 `PROJECTION_CONFLICT`。
5. resolver 按 projection factRefs 顺序命中指定历史版本，而非最新或相似记录。
6. 通过低层兼容入口准备一个含多个缺失 fact ref 的记录，resolver 聚合 `REFERENCE_NOT_FOUND`，且 projection/fact 均零回写。
7. query 可读取旧 ontology version 的历史 projection，不因当前 ontology 升版而过滤或改写。

## 回归边界

- 不修改 EventStore、运行时状态、低层 store API 或既有 JSONL shape。
- ONT.1 与旧 ontology 类型继续编译。

## 2026-09-18 验证结果

- core 与显式类型样例编译通过。
- `pnpm lint`：0 error，2983 条既有 warning。
- 架构边界：879 个生产文件 0 诊断，43 个导入用例 × 2 个 CWD 自测通过。
- OpenSpec strict validation 与 `git diff --check` 通过。
