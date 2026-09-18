# ONT.4 测试

| AC | 自动化用例 |
|---|---|
| 唯一 ID | 重复 concept ID 返回 `DUPLICATE_ID` 和第二项路径 |
| 引用完整 | 缺失 Domain/Concept/Property/FactType/Rule/Action/State 引用分别定位 |
| 状态归属 | Action/Transition 引用其他概念状态返回 `INVALID_STATE_BINDING` |
| 版本门控 | ontology ID/version 不匹配分别结构化拒绝 |
| Action 绑定 | 未知 Action 与 concept 不匹配分别拒绝 |
| 状态门控 | 缺少状态、未知状态、不允许状态分别拒绝 |
| 权限门控 | 每项缺失权限各返回 `PERMISSION_DENIED` |
| 纯函数 | 重复调用结果等值，输入深度序列化前后相同 |

自动化命令：定向 Vitest、core TypeScript 编译、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation。

测试使用内存 fixture，无用户数据和文件系统。无法自动化项：下游 UI/API 映射不属于本 Task。剩余风险：Rule expression 尚无稳定 schema，因此本轮仅验证引用。
