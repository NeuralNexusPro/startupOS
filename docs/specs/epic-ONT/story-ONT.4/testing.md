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

## 2026-09-18 验证结果

- Ontology 定向 Vitest：3 files、26 tests 全部通过；其中 validator 13 tests。
- Core TypeScript 编译通过。
- `pnpm lint`：0 error，仅 2983 条既有 warning。
- 架构边界：882 个生产文件 0 诊断；43 个导入用例 × 2 个 CWD 自测通过。
- OpenSpec strict validation 与 `git diff --check` 通过。
- Action 跨概念输入 FactType 正例通过；未对 `Projection.propertyMappings` 猜测未冻结引用语义。
