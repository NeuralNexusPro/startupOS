# SENSE.8 实施

- [x] 实现 retry policy/store、dead-letter 与 replay。
- [x] 实现按 Email/Webhook/Stream 区分的 health model/store。
- [x] 扩展审计查询与关联索引。
- [x] 实现 connector/rule/grant/health/dead-letter 管理 facade。
- [x] 验证 connector 故障隔离和敏感信息防泄漏。
- [x] 完成回归、typecheck 和 lint。

新增数据无需迁移；默认 connector disabled、无规则不执行。
