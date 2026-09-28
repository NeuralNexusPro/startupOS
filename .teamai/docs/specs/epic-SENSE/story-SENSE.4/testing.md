# SENSE.4 测试

## 自动化测试验证 Goal

目标：通过本 Story 定义的企业微信协议、攻击面和 gateway 集成测试。

| ID | 场景 | 预期 |
|---|---|---|
| S4-UT-01 | 固定 token/nonce/time/encrypted | 签名与 fixture 一致 |
| S4-UT-02 | AES fixture 解密 | 还原 JSON、校验 receiveId |
| S4-UT-03 | padding/length/receiveId 篡改 | 拒绝且不泄漏 key |
| S4-UT-04 | GET echostr | 返回无换行明文 |
| S4-UT-05 | 文本/事件 payload | 归一化字段与 source ID 稳定 |
| S4-IT-01 | 同 MsgId 两次 POST | 一个 event、第二次 duplicate |
| S4-SEC-01 | 错签名/过期 timestamp | 无 inbox/event |

执行：`vitest run src/modules/perception-runtime/__tests__/wecom-connector.test.ts`、core `tsc --noEmit`、`pnpm lint`。真实控制台 GET/POST 联调需要域名与企业凭据，后续以测试企业人工验证，剩余风险是平台配置差异。
