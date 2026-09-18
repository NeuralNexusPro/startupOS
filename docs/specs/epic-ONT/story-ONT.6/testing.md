# ONT.6 测试

| AC | 自动化用例 |
|---|---|
| 版本 | contract 过期 ontologyVersion 返回结构化拒绝 |
| Facts | 缺失 FactType、错误 Concept、重复 input/output 分别定位 |
| Actions | 未知 Action、错误 Concept、缺少权限分别拒绝 |
| 节点 | 重复 nodeId、edge 未知来源/目标分别拒绝 |
| Edge | 上游未生产或下游未消费分别拒绝 |
| 连通性 | required input 由入边/external input 满足；断流拒绝；optional 可空 |
| 纯函数 | 两次结果等值且输入不变 |

自动化命令：ontology 定向 Vitest、core TypeScript、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation、`git diff --check`。

测试使用内存 fixtures，无文件系统和用户数据。P2 DesignGap 映射与真实发布属于 P2.8。

## 2026-09-18 验证结果

- Ontology 定向 Vitest：5 files、41 tests 全部通过；其中 contract-validator 8 tests。
- Core TypeScript 与 `git diff --check` 通过。
- `pnpm lint`：0 error，仅 2983 条既有 warning。
- 架构边界：884 个生产文件 0 诊断；43 个导入用例 × 2 个 CWD 自测通过。
- OpenSpec strict validation 通过。
- 含 NUL 的稳定 ID 四元组碰撞回归通过；DAG 环、P2 发布和 runtime 不在本 Task 范围。
