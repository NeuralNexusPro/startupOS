# Story SENSE.10：Mail Connector Provisioning 与 Desktop 轮询闭环

**Story 编号：** SENSE.10  
**状态：** Implementation Complete  
**Owner：** Runtime & Desktop  
**创建/更新：** 2026-08-31

## User Story

作为个人用户，我希望在感知中心配置真实邮箱、验证连接并安全启用轮询，以便新邮件可以经过既有感知规则触发 Project、RoleAgent 或 Skill，而密码不会进入普通配置、日志或 Web API。

## 验收标准

- [x] 支持 IMAP Host、Port、TLS、用户名、邮箱目录、轮询间隔和密码/应用授权码配置。
- [x] 凭据只经 Electron IPC 写入 `safeStorage`，普通配置与 API 响应仅包含 `secretRef`。
- [x] “测试连接”验证 TLS、认证和邮箱目录，但不启动持久轮询。
- [x] 启用后 Desktop Supervisor 增量轮询，游标重启可恢复，单邮箱故障不影响其他 Connector。
- [x] 收取的新邮件复用 SENSE.3 归一化和 SENSE.7 路由链路。
- [x] Web-only 模式明确提示“不支持本地凭据绑定”，不降级为明文存储。

## 文档导航

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-31 | 初始化 Mail 真实配置与 Desktop 轮询闭环 Story |
| 2026-08-31 | 完成 Desktop 安全配置、IMAP 测试、常驻轮询、既有路由接入及自动化门禁 |
