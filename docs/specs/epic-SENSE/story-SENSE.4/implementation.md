# SENSE.4 实施

- [x] 定义 WeCom encrypted envelope、decrypted callback 和 secret 类型。
- [x] 实现签名、AES 解密、PKCS#7 与 receiveId 校验。
- [x] 实现 GET handshake helper 和自建应用 `PerceptionConnector`。
- [x] 声明自建应用与群机器人独立 capability。
- [x] 增加确定性加密 fixture、篡改、去重与 normalization 测试。
- [x] 运行 perception 回归、core/web typecheck 和定向 lint。

无迁移；通过 connector enable flag 启用。XML callback 留给兼容切片，首版使用官方 JSON 回调格式。
