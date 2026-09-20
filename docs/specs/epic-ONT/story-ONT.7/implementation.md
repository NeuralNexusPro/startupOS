# ONT.7 实施

## ONT7-T1

1. 在 ontology `types.ts` 增加 decision、execution context、snapshot、projection 和 checkpoint DTO。
2. 复用既有 `index.ts` 星号导出，不新增转发层。
3. 扩展现有类型样例，验证完整 context 可编译，缺少 attempt 或 contract hash 时被拒绝。
4. 运行 core 编译、类型样例、lint、架构边界与 OpenSpec strict validation。

## ONT7-T2

按依赖顺序实施：

1. 在 `types.ts` 增加 append/query/resolve 请求、成功结果与结构化失败结果；复用现有 projection、fact 和 validation 类型。
2. 在 `ontology-osdk.ts` 实现 append 的写前校验；fact ref 需精确存在，decision ref 只校验 ontology/version，重复 fact ref 拒绝。
3. 复用 `stableValue` 规范化完整 projection，并增加独立 projection tail 包住 read/dedupe/append；同一 project 内相同 id 的相同记录幂等，不同记录冲突。
4. 在同一 OSDK 实现 query，校验非空 context/attempt，严格隔离并支持 kind/revision 精确过滤。
5. 实现只读 resolver：先 query，再单次读取 facts，按 factRefs 顺序完整匹配；聚合缺失引用并保持零写入。
6. 在既有 `ontology-osdk.test.ts` 增加一个 projection API 测试组，覆盖 `testing.md` 所列用例。

只需修改 `types.ts`、`ontology-osdk.ts` 和 `__tests__/ontology-osdk.test.ts`。`index.ts` 已星号导出，store 已有 append/read 与 Date codec，均不改动；不增加依赖或新抽象。

## 研发完成条件

- 所有 ONT7-T2 验收用例通过，且拒绝路径证明没有写入 projection/fact。
- `git diff` 不包含 Web、Desktop、collaboration-runtime、memory-core 或低层 store 格式变更。
- 研发在本 Story 文档记录实际实现偏差、验证结果和剩余限制；不得把规划项标为完成。

## 验证命令

```bash
pnpm exec vitest run packages/core/src/lib/features/ontology/__tests__/ontology-osdk.test.ts
pnpm exec tsc -p packages/core/tsconfig.json --noEmit
pnpm lint
pnpm lint:boundaries
node scripts/check-architecture-boundaries.cjs --self-test
git diff --check
```

## 延后

调度、自动恢复、跨进程唯一、运行时 attempt/lease 门控和 UI 由对应 runtime/UI Story 实施。
