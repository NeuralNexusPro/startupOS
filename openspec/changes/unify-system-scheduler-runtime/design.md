# Design

## Context

动机见 [proposal.md](./proposal.md)。当前 `SchedulerService` 只读取持久化用户任务；`DesktopSchedulerService` 每 30 秒扫描一次。Perception Plugin Host 另行实现 Plugin SDK `schedule.every/cancel`，为每个 callback 创建 `setInterval`。Email 和 DingTalk 虽然不直接依赖 Desktop，但实际仍由第二套计时器驱动。

系统任务包含进程内 callback，不能写入 JSON；其 owner 在 Desktop 启动或连接器重载时可以确定性重新注册。用户任务的 JSON/JSONL 是现有状态事实源，必须保持兼容。

## Goals / Non-Goals

**Goals:**

- 一个 Core Runtime 同时处理持久化用户任务和临时系统任务。
- 系统任务之间并发隔离，同一任务防重并具有有界退避。
- Plugin Host 不再持有周期业务 timer，连接器生命周期直接映射到 Runtime 注册。
- 不改变插件 `every/cancel` API 和用户任务 UI。

**Non-Goals:**

- 不持久化 callback、凭据或插件 payload。
- 不把连接器业务重试、游标和健康判定移入调度层。
- 不改造自动更新、进程健康采样等与 Plugin SDK 无关的计时器。

## Decisions

### 1. 扩展现有 SchedulerService，不新增平行调度器

`SchedulerService` 保留用户任务 Store，并增加内存 system task registry。系统任务包含 `id`、`ownerId`、固定间隔、callback、退避配置和运行状态；owner 在重启后重新注册。用户任务继续走 `ScheduleStore`，旧记录缺少 owner 时按 user 处理。

备选方案是把 callback 序列化到 `tasks.json`，但函数不可安全恢复，也会把插件内部执行能力暴露给用户任务边界，因此不采用。另建 Plugin Scheduler 会保留当前双运行时问题，也不采用。

### 2. DesktopSchedulerService 是唯一平台计时入口

Desktop 使用一个固定的短 tick 驱动 `SchedulerService`。每次 tick 始终先派发到期系统任务；用户任务扫描保持原有持久化流程，并以独立 guard 防止用户扫描重入。这样长用户任务不会阻止邮箱 owner 的后续调度。

`DesktopSchedulerService` 暴露结构兼容 Plugin SDK 的 `every/cancel` 适配方法。`PerceptionPluginHostService` 通过构造参数接收该端口；Core Plugin Host 已经把 key 限定为 `pluginId:connectorId:key`，该 scoped key 直接作为稳定 system task ID/owner，不再解析正文或平台数据。

备选方案是为最近到期任务维护动态 `setTimeout` 堆。当前目标只有百级任务，固定 1 秒 tick 更短、更容易验证，满足现有最小间隔；若实测扫描成本超过 50ms，再换最小堆。

### 3. 系统 callback 后台派发，状态按任务隔离

到期 system task 在 tick 中原子标记 `running` 并更新下次触发，然后异步执行；tick 不等待 callback。相同任务再次到期时记录 overlap skip，其他任务仍可派发。每个任务独立保存 failure count 和 nextRunAt。

失败延迟使用 `min(interval * 2^failures, maxBackoff)` 并应用可注入的有界 jitter；成功清零失败计数并恢复正常间隔。Runtime 只保存通用安全码，不保存异常文本。测试注入 clock/random，生产使用系统时间和 `Math.random`。

### 4. 注销与退出采用停止派发后等待

`cancelSystemTask` 立即从 registry 移除，已开始 callback 不被重复触发。`stopSystemTasks` 先禁止新派发，再 `Promise.allSettled` 等待当前 in-flight；Desktop 先停止 Plugin Host，让插件调用 cancel，再关闭 Scheduler Runtime。首版 callback API 没有 `AbortSignal`，因此不伪造强制终止。

### 5. 可观测与数据边界

内部 system snapshot 只返回任务 ID、owner、间隔、next/last run、状态、连续失败数和安全码。插件凭据、邮件正文、callback 参数、异常 message/stack 不进入 Scheduler Store、run log 或 console。用户任务继续使用现有 run JSONL。

### 6. 架构与 subagent 写入边界

Core scheduler 位于 `packages/core/src/modules/scheduler/`，不依赖 Desktop、Web 或感知插件。Desktop 只做生命周期和 Plugin SDK 端口适配。平台插件代码不修改。符合 AGENTS.md 的 `desktop -> core modules -> storage/shared` 单向依赖。

应用源码由一个实现 subagent 在独立 Task worktree 串行修改：`packages/core/src/modules/scheduler/`、`packages/desktop/src/main/services/desktop-scheduler-service.ts`、`packages/desktop/src/main/services/perception-plugin-host/`、`packages/desktop/src/main/main.ts` 及对应测试。Proposal worktree只负责规格、合并和验证。

## Risks / Trade-offs

- [固定 tick 扫描频率增加] → system/user 集合均为百级目标，测试100任务开销；超过50ms再改动态timer。
- [callback无法强制取消] → 注销阻止后续派发，退出等待in-flight；未来只有插件API引入AbortSignal时再支持中断。
- [配置快速切换产生迟到完成] → scoped task注册幂等，注销后的旧Promise只结算自身且不能复活registry记录。
- [旧用户任务没有owner字段] → 兼容读取时默认user，不批量迁移或重写旧文件。

## Migration Plan

1. 发布兼容的Core system registry和测试。
2. Desktop将Plugin Host schedule port接到现有Scheduler实例，保持插件API不变。
3. 运行旧用户任务、邮箱/钉钉周期任务、配置热更新和退出回归。
4. 回滚时恢复Plugin Host本地timer端口；新增可选类型字段由旧读取器忽略，不删除用户任务或运行日志。

