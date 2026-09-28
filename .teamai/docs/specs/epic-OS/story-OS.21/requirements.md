# OS.21 需求：统一系统调度运行时与后台周期任务

## 需求来源

SENSE.10 的邮箱轮询当前由 `MailConnectorSupervisor` 自行运行一秒级 `setInterval`，而 OS.16 已有独立 Scheduler。两套计时循环造成生命周期、恢复、防重、退避和日志语义不一致。

## 功能需求

1. Scheduler Runtime 必须支持 `user` 与 `system` 两种 owner kind，并允许系统任务携带受控 owner ID。
2. 用户任务继续由 Schedule Store 持久化并由用户管理；系统任务由其业务 owner 注册和注销，默认不进入用户任务列表。
3. Runtime 必须提供注册、更新、取消、立即触发、暂停/恢复和查询运行状态的公共接口。
4. 系统周期任务支持固定间隔、首次立即执行、单实例串行、有界退避与随机抖动。
5. Desktop 启动后恢复系统 owner；退出时停止计时器并等待或安全终止在途执行。
6. 邮箱连接器作为首个迁移对象：每个启用连接器对应一个系统任务，停用或删除后取消。
7. 调度层只负责“何时执行”，邮箱抓取、游标、事件路由仍属于感知模块。
8. 运行记录不得包含 secret、邮件正文或未经脱敏的业务 payload。

## 验收场景

### AC1：统一注册

**Given** Desktop 启动且存在启用的 Email connector  
**When** 感知服务恢复连接器  
**Then** 它通过 Scheduler Runtime 注册 `system/perception-email/{connectorId}` 周期任务，且不创建第二套全局定时器。

### AC2：用户界面隔离

**Given** 同时存在用户定时任务和邮箱系统任务  
**When** 用户打开定时任务列表  
**Then** 默认只返回用户任务，系统任务只能通过内部诊断视图或显式 system filter 查询。

### AC3：防止重入

**Given** 一次邮箱轮询尚未结束  
**When** 下一个触发点到达  
**Then** Runtime 跳过或合并该触发，不并发执行同一 owner ID。

### AC4：失败隔离与退避

**Given** `email-qq` 连续失败而其他邮箱正常  
**When** Runtime 安排后续运行  
**Then** 只对 `email-qq` 有界退避，其他任务按原计划执行。

### AC5：生命周期同步

**Given** 用户停用或修改连接器轮询间隔  
**When** 配置变更被 Desktop 接收  
**Then** 对应系统任务被取消或原子重排，不产生重复任务。

### AC6：兼容用户任务

**Given** OS.16 已存在一次性、interval 或 cron 用户任务  
**When** 迁移到统一 Runtime  
**Then** 任务 ID、下一次执行、历史 run log、权限和工作目录语义保持兼容。

## 边界与异常

- 间隔小于安全下限时拒绝注册；系统时钟回拨不得重复执行同一 fire key。
- 应用睡眠恢复后按 owner 配置执行一次 catch-up 或跳过，不能形成补偿风暴。
- owner 执行器抛错不会终止 Runtime 主循环。
- owner 被删除、目标不存在或配置失效时注销任务并记录安全错误码。
- 不承诺应用完全退出或设备关机期间执行。

## 依赖关系

- 依赖 OS.16 现有 `packages/core/src/modules/scheduler/` 基础模型。
- 依赖 Desktop 生命周期与电源恢复事件。
- SENSE.10 依赖本 Story 提供系统任务注册接口完成迁移。

## 非功能需求

- 单次 tick 调度开销目标小于 50ms（不含业务执行）。
- 至少支持 100 个已注册任务而不阻塞 Electron 主线程。
- 核心调度逻辑单元测试覆盖率不低于 80%，owner adapter 集成点 100%。
- 严格 TypeScript，禁止 `any`；使用 JSON/JSONL，不引入数据库。

## 非目标

- 不把邮箱连接器显示为用户可编辑的定时任务。
- 不把业务重试、IMAP 协议或感知规则匹配逻辑移入 Scheduler。
- 不引入任意 shell 后台任务或绕过现有权限授权。
