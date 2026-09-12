## Context
UI detachActiveStream发ABORT；Desktop只removeAgent；destroy清监听却未终止底层执行。会话串行门等待旧stream完成，切回发送可能永远等待。
## Goals / Non-Goals
切换/取消后旧流结束，同会话新消息可执行。复用已有cancel接口，不增超时兜底掩盖锁泄漏，不修改无关记忆整理。
## Decisions
实施前检索所有remove/destroy/abort调用者，在最小共同边界终止底层Agent，Desktop取消路由调用现有Channel取消能力。保证取消幂等、无活动会话安全、其他会话不受影响。以受控pending prompt复现，不访问真实模型。
## Risks / Trade-offs
先取消再移除，旧流晚到事件不能污染新会话；不可通过删除队列或绕过串行约束假解锁。若实际复现失败先报告不猜测。
## Migration Plan
父代理提案与集成；独立runtime Task实施与回归，构建实际应用包后交付归档，无用户数据迁移。
## Open Questions
用户是否在未完成时切换已异步询问；当前缺少取消是独立可验证缺陷，修复后不声称覆盖所有无响应原因。
