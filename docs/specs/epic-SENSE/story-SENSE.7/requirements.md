# SENSE.7 需求

## 来源

Epic SENSE、OpenSpec 4.1–4.4，以及 Project/RoleAgent/Skill 既有 launcher 与 cognition ownership 规约。

## 功能需求

1. Rule 包含 id、enabled、source、eventTypes、条件、target、execution policy、createdAt/updatedAt。
2. 条件首版只允许 event 的稳定白名单路径与 `equals`、`contains`、`startsWith`、`exists`；禁止表达式和脚本。
3. target 为 project/role-agent/skill，必须由 `TargetAuthorizationPort` 确认存在、允许 external trigger 且 scope 未扩大。
4. 授权失败不得创建 lease 或 session，并写脱敏审计。
5. lease 键为 eventId + ruleId，原子获取；重复路由返回 existing lease。
6. `TriggerExecutionPort` 是 runtime 的下行边界，由上层 adapter 复用现有 launcher/session/task。
7. standalone skill 的 ownership=`ephemeral`，禁止 knowledge/pattern/cognition bank；inherited skill 必须提供 owner target。
8. execution context 携带 connectorId、eventId、ruleId、leaseId 和 rawPayloadRef，不把原始 payload 直接拼入 prompt。

## 验收场景

- 合法邮件规则匹配 Project → 授权、lease、一次 dispatch。
- disabled/不匹配 rule → 无 lease、无 dispatch。
- 未授权 RoleAgent → 拒绝且无执行。
- 重复 event/rule → 复用 lease，不重复 dispatch。
- standalone Skill → ephemeral；Project 内 Skill → project ownership。

## 非功能与边界

1000 条规则匹配目标 <50ms；单事件最多匹配 20 条，防止扇出失控。规则为 DataFile JSON，无数据库。执行 Port 失败保留 failed lease，交 SENSE.8 重试。
