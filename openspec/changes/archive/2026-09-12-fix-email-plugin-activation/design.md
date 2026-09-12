## Context
新插件已完成 IMAP connect/readOnly mailboxOpen，但旧门禁依赖 testReceipt，导致配置可保存却无法启用。
## Goals / Non-Goals
验证成功的当前配置可启用；未经验证和修改后的配置继续拒绝；不移除校验，不放宽凭据安全。
## Decisions
在 Desktop 宿主 provision 成功后，仅 email 分支规范化profile，复用现有 fingerprintMailProfile，保存绑定当前配置的 testReceipt。避免插件跨 SDK 导入基础设施。
## Risks / Trade-offs
失败时不得生成记录或保存新配置；已有缺记录配置必须先真实重验证，不能凭secretRef跳过门禁。
## Migration Plan
单独子代理 Task 实施，父代理验证、合并、构建、归档。已有用户记录经真实认证和只读邮箱打开成功后补当前配置验证记录；不自动启用重复连接。
## Open Questions
无。
