# ONT.4 需求

- FR1：校验各 canonical 集合稳定 ID 唯一。
- FR2：校验全部显式跨对象引用存在并属于正确概念。
- FR3：Action Gate 校验 ontology ID/version、Action/Concept 绑定。
- FR4：有 fromStateIds 时校验当前状态存在、归属且允许。
- FR5：调用权限必须覆盖 Action 的最小权限集合。
- FR6：返回 `CanonicalValidationResult`，issue 带稳定 code、message、path 与 severity。
- FR7：校验确定、无副作用，不修改输入。

非目标：Rule expression evaluator、Facts/revision 查询、Action 执行/回执、UI/IPC、旧 validator 替换。
