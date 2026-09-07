# SENSE.10 实施

1. [ ] 扩展 Mail profile/test receipt/credential port 类型及校验，补齐单元测试。
2. [ ] 实现 Desktop safeStorage secret adapter 与 IPC，验证磁盘/API/日志无明文。
3. [ ] 引入 IMAP adapter，实现超时、TLS、认证、mailbox 测试和安全错误映射。
4. [ ] 实现 MailConnectorSupervisor，接入 EmailPoller、cursor、health、retry 和应用生命周期。
5. [ ] 扩展感知中心 Email 表单、Electron 门禁、保存并测试、重新绑定与启停流程。
6. [ ] 保持 Web management route 只接受非敏感配置，并显式拒绝 password/token 字段。
7. [ ] 执行 Core/Desktop/Web 单元、IPC 集成、失败隔离、typecheck、lint 与真实邮箱人工验收。

## 兼容与迁移

现有 Email connector 若缺少完整 profile/test receipt，保持 disabled 并提示补全；不猜测 host，不迁移或生成凭据。已有 cursor 和事件数据保留。

## 审查重点

- 凭据不得进入 Zustand、fetch body、日志、审计或测试 snapshot。
- 配置改变必须使 test receipt 失效并自动停用。
- Supervisor 独立取消 timer/client，退出时释放连接。
- IMAP 失败只影响对应 Connector。
