## Context
routeAgentEvent先检查isEmptyStopRecoveryEnabled，关闭时返回，lastModelError未记录；throwIfModelStreamFailed随后无错误可抛。日志09:14 Role请求402随后Prompt completed，既有Agent测试预期reject却resolve。
## Goals / Non-Goals
模型失败总能返回失败，空回复重试仍可选。无需改模型选择或上游认证，不扩展取消链。
## Decisions
在可选重试门之前捕获assistant模型错误，再保留重试计数逻辑的原开关；检索事件路由所有调用方。真实OriginOSAgent替身测试，复用既有测试框架；检查Channel适配输出failed而非空completed。
## Risks / Trade-offs
上游HTTP402仍需用户选择可用模型或处理服务端账号，本次不伪造回复、不自动换模型。错误信息沿现有安全映射，不泄漏凭据。
## Migration Plan
单独runtime Task实施、测试、父代理集成构建归档，无数据迁移。原取消假设已被用户“上一轮结束”澄清排除为主因，未实施其源码。
## Open Questions
用户具体Skill名称/时间已异步询问；已证实Role问题先修复，未复現的Skill问题不宣称已解决。
