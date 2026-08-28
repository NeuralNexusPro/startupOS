# SENSE.8 交互

本 Story 提供产品 facade，不直接实现 UI。状态为 healthy/degraded/disconnected/disabled；Email 显示 mailbox/cursor，Webhook 显示最近 callback，Stream 显示 connection/backpressure。手工 replay 必须二次确认并展示将重新执行的 target 与 HITL 策略。所有错误使用安全 code。
