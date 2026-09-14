## Context

IMAP 是长连接/周期轮询协议，真实密码属于 Desktop 安全边界；Next.js Route 既不适合常驻运行，也不得成为凭据通道。

## Goals / Non-Goals

**Goals:** 安全配置、连接测试、增量轮询、重启恢复、故障隔离。  
**Non-Goals:** OAuth 授权 UI、SMTP 发信、企微/飞书/钉钉 provisioning、云端 secret vault。

## Decisions

1. 凭据只通过 preload IPC 进入 Desktop safeStorage，配置/API 只含 secretRef。
2. Core 定义 ports，Desktop 以 imapflow 实现；禁止 Core 依赖 Electron 或 IMAP SDK。
3. 关键 profile/secret 改变后自动 disabled 并使 test receipt 失效。
4. Supervisor 每 Connector 独立调度和退避，复用 EmailPoller 及统一事件路由。
5. safeStorage 不可用时 fail closed，不提供明文 fallback。
6. 首次轮询以 IMAP `UIDNEXT - 1` 建立 mailbox-head baseline，不导入历史邮件；已有游标和显式 `initialUid` 继续按原语义增量处理。
7. 增量拉取必须请求完整 RFC822 source，并在 Desktop 边界完成 MIME 解码；优先传递 `text/plain`，仅有 HTML 时转换为可读文本，正文作为规范化事件内容完整传给目标。
8. 感知目标通过显式 `[PERCEPTION_ESCALATE]` 标记请求人工处理；Desktop 对每个已获得 lease 的执行最多发送一次原生系统通知，通知投递失败不得导致目标执行重试。

## Risks / Trade-offs

- Linux keyring backend 能力差异：启动时检查 safeStorage backend，并在不安全时拒绝绑定。
- 邮箱供应商认证差异：首版支持 password/app password 和已有 OAuth2 token，不做 OAuth 跳转。
- UIDVALIDITY 改变可能重扫：依赖 source event dedupe 与 lease 保证不重复执行。

## Migration

旧 Email connector 保持 disabled，用户补齐 profile 并测试后启用；保留原有 cursor/event/audit。
