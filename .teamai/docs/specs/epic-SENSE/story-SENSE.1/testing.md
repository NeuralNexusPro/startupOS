# 测试文档 - Story SENSE.1

**最后更新:** 2026-08-28

## 自动化测试 Case

| ID | 类型 | 场景 | 预期 |
|---|---|---|---|
| S1-UT-01 | 单元 | 合法 PerceptionEvent | 类型/运行时校验通过 |
| S1-UT-02 | 单元 | connectorId 含 `../` | 路径解析前拒绝 |
| S1-UT-03 | 单元 | payload 为 256 KiB | 接受 |
| S1-UT-04 | 单元 | payload 超过 256 KiB | 不落盘并返回 PAYLOAD_TOO_LARGE |
| S1-UT-05 | 单元 | 嵌套 token/password/cookie | 递归脱敏，其他字段保留 |
| S1-UT-06 | 单元 | 相同 evidence 重试 | 审计可追加，canonical event 不重复 |
| S1-IT-01 | 集成 | Inbox → Event | rawPayloadRef 正确且 event 不含原始 payload |
| S1-IT-02 | 集成 | DataFile 覆盖时保留 recovery | 当前文件损坏时可恢复 |
| S1-IT-03 | 集成 | current/recovery 均损坏 | 明确抛错，不返回空数据伪装成功 |
| S1-IT-04 | 集成 | 10K dedupe key | 查询结果正确并记录耗时 |
| S1-SEC-01 | 安全 | 绝对路径/路径穿越 ID | workspace 外不创建文件 |
| S1-SEC-02 | 安全 | audit 输入含 secret | audit 文件中不存在 secret 原值 |

## 验证 Goal

Story 完成后创建自动化测试验证 goal：**“通过 Story SENSE.1 中定义的全部测试 case”**。必须运行 perception-runtime 测试和 `pnpm lint`；性能阈值受 CI 主机波动影响时记录原始数据与剩余风险。

## 当前状态

- 测试 case：✅ 已定义
- 自动化测试：✅ 定向测试 6/6 通过；性能与全量 lint 留待 Epic 验证阶段
- 验证 Goal：⬜ 待实现完成后创建
