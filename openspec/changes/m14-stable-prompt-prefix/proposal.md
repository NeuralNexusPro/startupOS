# Proposal：稳定 Agent system prompt 前缀

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T2
- owner：Pi Agent Runtime
- 来源：`docs/specs/epic-M/story-M.14/`

## Why

当前 RoleAgent、Project Agent 和协作 Agent 把阶段、记忆、工作目录等会话数据放在 system prompt 前部，状态变化会破坏 provider 的前缀复用。需要把不可变规则与会话快照明确分开。

## What Changes

- 复用现有 prompt layers，将身份、固定思维/协作协议、安全和权限策略组成稳定 system prompt。
- 阶段、Core Memory、工作目录和认知目录作为会话级冻结上下文，通过现有模型上下文转换注入。
- 对稳定 system prompt 计算 SHA-256 和长度，仅记录数字/hash，不记录正文。
- Tool/Skill 或安全策略真实变化时允许 hash 改变并自然失效。

## 非目标

- 不实现 provider KV cache。
- 不改变权限更新语义。
- 不接入每轮认知预取。

## Capabilities

### New Capabilities

- `stable-agent-prompt-prefix`：Agent 会话具有可验证的稳定 system prompt 和独立会话上下文。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`
- public APIs：prompt 组装结果增加稳定 prompt 与会话上下文边界。
- persistence / IPC / packaging：无新存储；恢复路径需重建同一边界。
- 依赖：M14-T1。

## 上线方案

先以确定性测试覆盖四条 Agent 链路，再随 Core 发布；hash 只进入安全诊断。

## 回滚方案

回滚 prompt 组装和上下文转换提交；会话数据格式不变。
