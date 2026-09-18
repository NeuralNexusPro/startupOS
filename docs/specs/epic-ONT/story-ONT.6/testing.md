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
