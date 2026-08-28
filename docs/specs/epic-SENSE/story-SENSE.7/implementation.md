# SENSE.7 实施

- [x] 在 Layer 1 types 定义 TriggerRule、Target、Ownership、Authorization/Execution Ports。
- [x] 实现 Rule validator/store 与安全字段 matcher。
- [x] 实现 target authorization orchestration 和拒绝审计。
- [x] 强化 lease 获取、完成/失败状态与重复返回。
- [x] 实现 PerceptionRouter 与 provenance execution context。
- [x] 增加既有 launcher 的上层 adapter，复用 session/task 入口。
- [x] 覆盖 standalone/inherited Skill ownership。
- [x] 运行规则、授权、幂等、路由、故障与架构测试。

新增能力默认无规则即不触发；不迁移主动会话。启用规则前必须显式授权目标。
