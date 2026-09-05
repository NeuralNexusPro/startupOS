# SENSE.10 交互

## 用户流程

```text
感知中心 → 感知源 → 添加 Email → 填写 IMAP 与 write-only 凭据
  → 保存并测试
      ├─ 成功：连接已验证 → 用户启用 → Desktop 后台轮询
      └─ 失败：显示安全错误码 → 修改/重新绑定 → 重试
```

## 表单与状态

- 基本信息：连接 ID、显示名称。
- 服务器：Host、Port（TLS 默认 993）、TLS 开关。
- 账号：Username、Password/App Password（永不回显）；已有凭据只显示“已绑定”。
- 轮询：Mailbox 默认 INBOX、间隔默认 60 秒。
- 操作：“保存并测试”“取消”；测试成功后列表提供“启用”。
- 状态：`idle`、`saving`、`testing`、`verified`、`failed`、`running/degraded/disabled`。

重新编辑关键配置或重新绑定凭据会自动停用并清除测试状态。Web-only 模式表单只读并提示使用 Electron 桌面版。错误使用 `role=alert`，异步状态使用 `role=status`，键盘可完成全部操作。
