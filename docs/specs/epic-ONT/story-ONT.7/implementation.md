# ONT.7 实施

## ONT7-T1

1. 在 ontology `types.ts` 增加 decision、execution context、snapshot、projection 和 checkpoint DTO。
2. 复用既有 `index.ts` 星号导出，不新增转发层。
3. 扩展现有类型样例，验证完整 context 可编译，缺少 attempt 或 contract hash 时被拒绝。
4. 运行 core 编译、类型样例、lint、架构边界与 OpenSpec strict validation。

## ONT7-T1 延后项

存储、append/query、resolver、门控、恢复协调和 UI 在后续 Task 实施。

## ONT7-T2

1. 在 ontology `types.ts` 增加 projection query/resolver 输入与结果类型。
2. 在既有 `CanonicalOntologyOSDK` 增加只读 query/resolver，复用 store、ontology validator 和精确 fact reference 比较。
3. latest 单次扫描按 projection id 去重：更高 revision 胜出，同 revision 后写胜出，最终保持日志顺序。
4. 扩展现有 OSDK 测试，覆盖精确过滤、latest、跨 context 隔离、版本错误、非法 fact reference 和无写入保证。
5. 运行 core type-check、定向 Vitest、lint、架构边界、自测、OpenSpec strict validation 与 `git diff --check`。

## 延后（ONT7-T2 后）

projection 写入门控、权限授权、跨进程索引、checkpoint 恢复协调和下游适配继续由后续 Story/ONT.8 负责。
