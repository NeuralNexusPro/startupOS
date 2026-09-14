# SENSE.7 测试

## 自动化验证 Goal

目标：通过 SENSE.7 定义的规则、授权、lease、路由和认知 ownership 测试。

| ID | 场景 | 预期 |
|---|---|---|
| S7-UT-01 | 合法/非法 Rule | 接受合法，拒绝脚本/未知路径 |
| S7-UT-02 | equals/contains/startsWith/exists | 匹配确定 |
| S7-UT-03 | disabled/source/type 不符 | ignored |
| S7-SEC-01 | target 未授权 | 无 lease/dispatch |
| S7-IT-01 | event + rule 首次/重复 | 一次 dispatch，一个 lease |
| S7-IT-02 | Project/RoleAgent/Skill adapters | 调用既有 Port，不建新执行器 |
| S7-IT-03 | standalone/inherited Skill | ephemeral / owner cognition |
| S7-FAIL-01 | dispatch 抛错 | failed lease，可供后续重试 |

执行 core Vitest/typecheck、相关 adapter integration tests、依赖扫描和 lint。真实模型执行不用于确定性单测；以 fake Port 验证 runtime，以现有 session fixtures 验证 adapter。
