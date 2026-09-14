# SENSE.8 需求

1. Retry record 保存 event/rule/attempt/nextAttemptAt/lastSafeCode，不保存异常原文。
2. 退避为有界指数算法并支持测试时注入 jitter；达到 rule maxAttempts 后进入 dead-letter。
3. health 按 connector 独立保存：Email 观察 cursor/poll，Webhook 观察 callback/ACK，Stream 观察 connection/reconnect/backpressure。
4. Facade 提供 connector enable/disable、rule CRUD、grant CRUD、health/audit/dead-letter 查询与安全 replay。
5. replay 创建新尝试但沿用原 event/rule provenance，不能绕过授权。

验收覆盖成功重试、耗尽、毒事件、连接隔离、脱敏查询、重放再次授权。DataFile/JSONL，无数据库；列表有界分页。
