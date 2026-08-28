# 交互设计文档 - Story SENSE.2

本 Story 无 UI。HTTP 边界把结构化 GatewayError 映射为 400/401/404/409/413/500；响应不得包含 secret、原始 payload 或本地路径。

```text
HTTP callback -> thin route -> WebhookGateway -> Connector ACK
                                      └-> durable Inbox/Event
```

未来连接管理 UI 只显示脱敏错误码、发生时间和 connector health，并满足键盘与屏幕阅读器要求。

