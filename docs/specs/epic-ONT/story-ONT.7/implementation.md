# ONT.7 实施

## ONT7-T1

1. 在 ontology `types.ts` 增加 decision、execution context、snapshot、projection 和 checkpoint DTO。
2. 复用既有 `index.ts` 星号导出，不新增转发层。
3. 扩展现有类型样例，验证完整 context 可编译，缺少 attempt 或 contract hash 时被拒绝。
4. 运行 core 编译、类型样例、lint、架构边界与 OpenSpec strict validation。

## 延后

存储、append/query、resolver、门控、恢复协调和 UI 在后续 Task 实施。
