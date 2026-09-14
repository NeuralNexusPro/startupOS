# SENSE.5 实施

- [x] 扩展 verification context 的可选 rawBody，Route 保留原始请求文本。
- [x] 定义飞书 v2/encrypted/challenge 类型。
- [x] 实现签名、AES 解密和 Verification Token 校验。
- [x] 实现 challenge ACK、消息/mention/action normalization。
- [x] 实现 event_id 去重和附件受控引用。
- [x] 完成 crypto、gateway、route fixtures 和回归验证。

无数据迁移。长连接模式通过未来 Desktop/Service adapter 实现，不把 SDK 或持久连接放入 Next.js Route。
