# SENSE.6 测试

## 自动化验证 Goal

目标：通过 Stream frame normalization、trust boundary、幂等、凭据防泄漏与回归用例。

| ID | 场景 | 预期 |
|---|---|---|
| S6-UT-01 | 官方结构机器人 frame | message/mention 字段正确 |
| S6-UT-02 | card callback frame | action.invoked |
| S6-UT-03 | inner msgId 缺失 | header messageId 回退 |
| S6-IT-01 | 同 msgId 两个 frame | 一个 event，第二个 duplicate |
| S6-SEC-01 | authenticated=false | 无持久化 |
| S6-SEC-02 | sessionWebhook/token | 所有文件无明文 |
| S6-IT-02 | 附件 downloadCode | 只有受控哈希引用 |

执行 core perception Vitest、core/web tsc、定向 lint、`rg` 依赖检查。真实 Stream 重连与平台 LATER 行为需要测试企业，留 SENSE.8 supervisor 人工联调。
