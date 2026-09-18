# ONT.5 测试

| AC | 自动化用例 |
|---|---|
| 查询版本 | 过期 ontologyVersion 结构化拒绝且无 facts |
| 类型过滤 | Concept/FactType 过滤只返回匹配记录 |
| latest | revision 最大者胜出，相同 revision 后追加者胜出 |
| Action Gate | 版本、状态、权限错误在写入前拒绝 |
| 输入输出 | 缺少输入或未声明输出 FactType 拒绝 |
| revision | expectedRevision 不匹配返回 `REVISION_CONFLICT` |
| 幂等 | accepted 重试不增加 facts/operations |
| 冲突 | 同 operationId 不同请求返回 `OPERATION_CONFLICT` |
| 恢复 | intent 加部分 facts 后重试仅补齐缺失项 |
| Rule | 有 ruleIds 且无 evaluator 时不写文件 |
| 审计 | accepted 回执保留 actor/run/workItem metadata |

自动化命令：ontology 定向 Vitest、core TypeScript 编译、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、OpenSpec strict validation、`git diff --check`。

测试使用临时 data root，无用户数据。无法自动化项：跨进程单写宿主由后续 adapter 验证；本 Task 不声明跨进程锁。
