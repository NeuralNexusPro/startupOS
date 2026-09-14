# SENSE.7 架构

## 边界

`perception-runtime`（Layer 2）实现 rule store/validator/matcher、authorization orchestration、lease 与 router，但不导入 pi-agent 或 feature 内部实现。它只依赖位于 Layer 1 types 的 `TargetAuthorizationPort` 和 `TriggerExecutionPort`。具体 adapter 放在上层 feature/service，调用 launcher 公共 API。

```text
PerceptionRouter -> RuleStore/Matcher -> AuthorizationPort -> LeaseStore -> ExecutionPort
                                                                     ↓ adapter
                                               existing Launcher / Session / Task Runtime
```

数据位于 `data/perception/rules/{ruleId}.json` 与 `leases/`。Rule filter 采用白名单字段访问器，无 eval/regex。Target descriptor 和 ownership 全部为判别联合类型。

依赖方向为上层 adapter → runtime public API，并通过依赖注入把 Port 传入；core module 不反向依赖 Web/Desktop，符合 AGENTS.md。
