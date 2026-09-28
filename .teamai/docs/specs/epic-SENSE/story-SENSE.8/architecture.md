# SENSE.8 架构

`perception-runtime/operations` 实现 retry/dead-letter/health 存储与策略；`lib/features/perception` 提供管理 facade；Web API Route 未来只做参数与响应映射。scheduler 只接收 nextAttemptAt，不解析平台 payload。每个 connector 使用独立 health/retry partition。数据位于 `data/perception/{retry,dead-letter,health}`，遵循 DataFile、脱敏和单向依赖规约。
