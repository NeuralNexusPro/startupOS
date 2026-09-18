## ADDED Requirements

### Requirement: 迁移记录表达回滚终态
系统 SHALL 允许 migration record 使用 `rolled_back` 终态，且 MUST 与 started、completed 和 failed 区分。

#### Scenario: 迁移回滚被审计
- **WHEN** 已完成的 legacy migration 被安全回滚
- **THEN** migration record SHALL 使用 rolled_back 终态而非 completed 或 failed 表示结果
