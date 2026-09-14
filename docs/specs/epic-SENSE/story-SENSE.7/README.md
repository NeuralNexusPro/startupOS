# Story SENSE.7：Trigger Rule、目标授权与运行时路由

**状态：** Complete  
**Owner：** Runtime  
**创建/更新：** 2026-08-28

## User Story

作为用户，我希望已认证事件只按声明式规则触发明确授权的 Project、RoleAgent 或 Skill，以便外部感知不会扩大工具、工作区或长期认知权限。

## 验收标准

- [x] Trigger Rule 严格校验 source/type/filter/target/policy。
- [x] 匹配确定且有界，未知字段或操作符拒绝。
- [x] 授权先于 lease 和执行，重复事件只获得一个有效 lease。
- [x] 通过 Port 路由到既有 session/task runtime，不建立第二执行器。
- [x] standalone Skill 不拥有长期认知；继承 Skill 归属 Project/RoleAgent。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-08-28 | 初始化完整实施规格 |
| 2026-08-28 | 完成规则、授权、lease、launcher adapter 与 ownership 验证 |
