# SENSE.6 实施

- [x] 下沉 Perception protocol types，修复 integration → module 依赖。
- [x] 定义 Stream frame、trust context、ACK 和 normalizer。
- [x] 实现机器人消息、mention、card/event normalization。
- [x] 实现 runtime ingress、inbox 预脱敏、event dedupe。
- [x] 增加 frame、重复、未认证、secret 与附件 fixtures。
- [x] 运行 perception 回归、typecheck 和依赖搜索。

无数据迁移。真实 Stream supervisor 与生命周期健康管理在 SENSE.8 装配。
