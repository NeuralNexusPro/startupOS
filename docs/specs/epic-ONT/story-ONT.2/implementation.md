# ONT.2 实施

1. 增加 fact/operation/migration record 类型。
2. 实现 canonical ontology store 的安全路径、原子快照、JSONL append/read 和 operation 最新回执。
3. 从 ontology `index.ts` 导出 store。
4. 使用临时目录测试往返、并发、截断恢复、损坏与路径遍历。
5. 运行 core 测试/编译、lint、边界检查和 OpenSpec strict validation。
