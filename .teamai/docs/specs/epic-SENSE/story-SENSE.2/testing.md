# 测试文档 - Story SENSE.2

**最后更新:** 2026-08-28

| ID | 类型 | 场景 | 预期 |
|---|---|---|---|
| S2-UT-01 | 单元 | registry 未注册/禁用 | NOT_FOUND/DISABLED，不调用 Connector |
| S2-UT-02 | 单元 | verify false | 401、脱敏 audit、无 Inbox |
| S2-UT-03 | 单元 | timestamp 超 5 分钟 | REPLAY_WINDOW_EXPIRED |
| S2-UT-04 | 单元 | replayKey 重复 | 第二次 REPLAY_DETECTED |
| S2-IT-01 | 集成 | 合法 callback | Inbox/Event 均落盘后 ACK |
| S2-IT-02 | 集成 | source event 重投 | ACK 成功、canonical Event 仅一个 |
| S2-IT-03 | 集成 | normalize 抛错 | 500、Inbox 保留、审计无 payload |
| S2-ROUTE-01 | Route | 非 JSON/超限/未配置 | 400/413/503，无业务副作用 |
| S2-SEC-01 | 安全 | 错误携带 secret | HTTP 与 audit 不出现原值 |

实现完成后创建验证 goal：**“通过 Story SENSE.2 中定义的全部测试 case”**，运行定向测试、Route 测试、tsc 和 lint。

