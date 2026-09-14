# SENSE.5 测试

## 自动化验证 Goal

目标：通过 SENSE.5 的协议正确性、篡改防御、challenge、去重和 Route raw body 用例。

| ID | 场景 | 预期 |
|---|---|---|
| S5-UT-01 | 固定 raw body/headers | SHA-256 fixture 一致 |
| S5-UT-02 | AES fixture | 解密回 v2 JSON |
| S5-UT-03 | 错签名/token/cipher | 认证失败或安全异常 |
| S5-UT-04 | challenge | 返回 challenge，无 event |
| S5-UT-05 | text/group mention/action | 正确标准事件类型和字段 |
| S5-IT-01 | event_id 重试 | 一个 event，后续 duplicate |
| S5-IT-02 | Route 请求 | rawBody 未被重排后传给 core |
| S5-SEC-01 | 文件/image resource | 仅受控引用，无二进制 |

执行 perception Vitest、Route Vitest、core/web tsc、定向 ESLint。真实控制台联调需要测试企业及公网 URL，后续人工验证权限发布、1 秒 challenge 和平台重推。
