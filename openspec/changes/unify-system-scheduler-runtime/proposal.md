# Proposal

## Why

OS.16 用户定时任务与 Perception Plugin Host 的邮箱／插件周期任务各自维护计时循环，导致防重、失败退避、退出等待和运行诊断不一致。OS.21 需要让两类任务共享同一个 Core Scheduler Runtime，同时保持系统任务对普通用户列表隐藏。

追溯信息：`epic-id: epic-OS`，`story-id: story-OS.21`，`task-id: OS21-T1`，`owner: System Runtime`，来源：`docs/specs/epic-OS/story-OS.21/`。

## What Changes

- 扩展 Core Scheduler Runtime，支持持久化用户任务和由业务 owner 注册的临时系统周期任务。
- 系统任务具备独立 owner、默认隐藏、单实例防重、首次触发控制、有界指数退避、可注入 jitter、运行快照和安全错误码。
- Desktop 只保留一个 Scheduler 计时循环；Perception Plugin Host 的 `schedule` port 改为向该 Runtime 注册和注销任务，不再自行创建插件轮询 `setInterval`。
- 邮箱和钉钉现有插件继续使用 Plugin SDK schedule port；启停、配置重载和应用退出会幂等重排、注销并等待在途任务。
- 用户任务的 JSON/JSONL、任务 ID、动作、工作目录和运行记录保持兼容；旧任务按 user owner 读取。
- 增加 Core 与 Desktop 回归，覆盖隐藏、并发隔离、防重、退避、配置重排、停止等待和旧用户任务兼容。

非目标：不把邮件抓取、IMAP、连接器业务重试或感知规则放入 Scheduler；不让系统任务出现在普通定时任务 UI；不保证应用退出或设备关机期间执行；不新增数据库、后台服务或第三方依赖。

依赖：复用 OS.16 `packages/core/src/modules/scheduler/`、现有 Plugin SDK schedule port 和 Desktop 生命周期。上线随 Core/Desktop 常规构建交付；回滚时恢复 Plugin Host 的本地 schedule port，并保留新增可选用户任务字段，旧读取路径可忽略这些字段。

## Capabilities

### New Capabilities

- `unified-system-scheduler-runtime`: 用户定时任务与隐藏系统周期任务共享调度运行时的注册、隔离、防重、退避、生命周期和兼容行为。

### Modified Capabilities

无。

## Impact

- Core：`packages/core/src/modules/scheduler/` 公共类型、运行时和测试。
- Desktop：`desktop-scheduler-service`、Perception Plugin Host composition、应用启动／退出接线及测试。
- Plugin SDK：保持现有 `every/cancel` 契约，不修改平台插件实现或协议。
- 持久化：用户任务继续使用现有 JSON/JSONL；系统 callback 由 owner 在启动时重新注册，不持久化函数或凭据。
- Web/API：普通用户任务查询行为不变，无新增 UI。
- 打包：需验证 Desktop TypeScript 与 Agent Worker/插件打包依赖边界。
