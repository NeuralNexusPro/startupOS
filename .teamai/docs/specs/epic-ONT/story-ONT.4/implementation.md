# ONT.4 实施

1. 定义最小 Action Gate 输入类型和稳定错误码。
2. 实现 canonical ontology 唯一性与交叉引用校验。
3. 实现 ontology identity/version、Action/Concept、状态和权限门控。
4. 从 ontology `index.ts` 导出公共 API。
5. 使用一个完整合法 fixture 覆盖成功、结构损坏与各门控拒绝。
6. 运行定向 Vitest、core 编译、lint、架构检查和 OpenSpec strict validation。

审查重点：不依赖旧 store、不执行 expression、不抛业务异常、不修改输入。回滚无需数据处理。
