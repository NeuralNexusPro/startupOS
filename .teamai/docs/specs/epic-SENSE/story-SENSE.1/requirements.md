# 需求文档 - Story SENSE.1

**最后更新:** 2026-08-28

## 需求来源

来自 Epic SENSE 与 OpenSpec `external-perception-runtime` capability。本 Story 只建立平台无关基础，不实现具体邮箱/IM 协议和 Agent 路由。

## 功能需求

1. `PerceptionEventV1` 必须包含稳定事件 ID、source/sourceEventId、connectorId、事件类型、发生/接收时间、actor、conversation、受控 content 和 rawPayloadRef。
2. Connector Contract 必须声明 capabilities，并把 verify/normalize/ack 与业务运行时分离。
3. Inbox payload 默认最大 256 KiB；超限拒绝，附件只保存引用。
4. connectorId、sourceEventId 和所有文件名必须经过 ID 校验，禁止绝对路径和 `..`。
5. 存储必须满足 DataFile envelope、原子替换和最近一个 recovery 副本。
6. 内容防御必须对常见 secret/token/password 字段递归脱敏，原始 secret 不写入审计。
7. 去重键为 connectorId + sourceEventId；重试投递保留审计，但不得产生第二个 canonical event。

## Given / When / Then

- **Given** 合法 payload，**When** 写入 Inbox 并归一化，**Then** 生成一个事件且 raw 内容只通过引用访问。
- **Given** 相同平台事件投递两次，**When** 保存，**Then** 第二次返回 duplicate 并指向同一事件。
- **Given** 300 KiB payload，**When** 写入，**Then** 在落盘前拒绝。
- **Given** payload 含 `access_token/password/secret`，**When** 防御，**Then** 对应值替换为脱敏标记。
- **Given** 当前 DataFile 损坏且 recovery 有效，**When** 读取，**Then** 从 recovery 恢复；两者均损坏则明确失败。

## 非功能要求

- 单次本地写入 p95 <50ms；去重查询在 10K 索引下 p95 <20ms。
- 核心业务单元测试覆盖率 ≥80%，存储与 Connector Contract 集成点覆盖 100%。
- 不使用数据库、Express/Koa、`any` 或反向依赖。

