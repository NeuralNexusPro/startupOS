# ONT.5 需求

- FR1：查询请求必须校验 project、ontology ID/version 及 Concept/FactType 过滤引用。
- FR2：支持完整事实列表与按 factId 的确定性最新 revision 查询。
- FR3：Action 提交复用 ONT.4 Gate，并校验输入事实、输出类型和 expectedRevision。
- FR4：OSDK 从当前本体解析输出 concept 并生成 canonical fact reference。
- FR5：operationId 对相同请求幂等，对不同请求返回冲突。
- FR6：intent 中断后只补写缺失事实并形成 accepted 回执。
- FR7：回执保留结构化审计上下文，但 metadata 不参与授权。
- FR8：包含 ruleIds 且无 evaluator 的 Action 必须明确拒绝。

非目标：Rule evaluator、外部副作用、instance 状态更新、Web/Desktop adapter、跨进程文件锁、数据库和投影查询。
