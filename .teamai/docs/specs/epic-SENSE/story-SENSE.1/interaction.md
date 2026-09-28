# 交互设计文档 - Story SENSE.1

**最后更新:** 2026-08-28

## 适用性

本 Story 为纯运行时基础设施，不新增 UI，线框图、响应式和动画不适用。

## 系统交互

```text
Connector -> verify -> bounded Inbox -> normalize -> canonical Event
                    invalid/oversize -> reject + redacted audit
                    duplicate        -> existing event reference
```

失败必须结构化返回错误码，供后续 Webhook Gateway 映射为平台 ACK/HTTP 响应；不得把内部路径、secret 或原始 payload 暴露给最终用户。

## 可访问性

无新增用户界面。未来管理界面必须以文本呈现 connector health、拒绝原因和 dead-letter 状态，不只依赖颜色。

