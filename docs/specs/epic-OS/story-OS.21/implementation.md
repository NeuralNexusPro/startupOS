# OS.21 实施计划

## 实施步骤

- [ ] 1. 盘点 OS.16 Scheduler 与 `MailConnectorSupervisor` 的模型、timer、生命周期和日志差异。
- [ ] 2. 在 Core scheduler 公共 API 中增加 owner、visibility、overlap 和 missed-run 语义，并补迁移兼容测试。
- [ ] 3. 实现单 timer due queue、fire-key 防重、任务级 in-flight guard 和可注入 Clock。
- [ ] 4. 实现任务级有界退避与 jitter，确保一个 owner 失败不影响其他任务。
- [ ] 5. 将现有用户任务执行器接入 Runtime，保持 CRUD、run-now、run log 和权限语义。
- [ ] 6. 新增 Perception Email owner adapter，将 `MailConnectorSupervisor` 的独立 `setInterval` 改为幂等系统任务注册。
- [ ] 7. 接入 Desktop ready/quit/suspend/resume 与连接器启停、配置更新生命周期。
- [ ] 8. 默认从定时任务 API/UI 过滤 internal 任务，并提供只读诊断查询边界。
- [ ] 9. 执行单元、集成、恢复、防重、性能、TypeScript、lint 与人工验收。

## 文件级范围

- MODIFY `packages/core/src/modules/scheduler/types.ts`
- MODIFY `packages/core/src/modules/scheduler/scheduler-service.ts`
- MODIFY `packages/core/src/modules/scheduler/schedule-store.ts`
- ADD `packages/core/src/modules/scheduler/runtime-scheduler.ts`
- ADD `packages/core/src/modules/scheduler/backoff-policy.ts`
- MODIFY `packages/core/src/modules/scheduler/index.ts`
- MODIFY `packages/desktop/src/main/services/perception-mail/mail-connector-supervisor.ts`
- MODIFY Desktop scheduler/lifecycle 装配文件（实施盘点后确定准确入口）
- MODIFY schedules API/service，使其默认只返回 user visibility
- ADD/UPDATE 对应 Core、Desktop、Web 测试

## 迁移与兼容

- 第一阶段允许旧 Scheduler 与新 Runtime 通过 adapter 共存，但同一任务只能由一方拥有。
- 邮箱迁移采用 feature flag 或一次性切换测试，确认新任务注册成功后才移除旧 timer。
- 旧 `tasks.json` 必须可直接读取；新增字段使用安全默认值 `owner.kind=user`、`visibility=user`。
- 回滚时可恢复旧 owner adapter，不修改邮箱 cursor、事件或规则数据。

## 审查要点

- Core 不得导入 Electron、Web 或 IMAP SDK。
- 不能把邮箱轮询业务复制到 scheduler。
- 系统任务不能意外出现在用户 CRUD 接口或被普通用户修改。
- `run-now`、正常 tick、resume catch-up 共享同一防重入口。
- timer、power event listener 和 owner listener 在 stop 后全部释放。
- 调度日志不得包含 secret 或业务 payload。
