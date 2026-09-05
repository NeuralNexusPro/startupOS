# OS.21 架构：统一 Scheduler Runtime

## 影响模块

| 层级 | 模块 | 职责 |
|---|---|---|
| Core Layer 2 | `packages/core/src/modules/scheduler/` | 通用时钟、队列、fire key、防重、退避、运行摘要 |
| Core Layer 2 | `packages/core/src/modules/perception-runtime/` | 邮箱 owner adapter；保留游标、抓取和路由业务 |
| Desktop Layer 6 | `packages/desktop/src/main/` | Runtime 启停、电源恢复、Electron 环境装配 |
| Web Layer 4/5 | 现有 schedules UI/API | 默认过滤用户任务，不承载调度逻辑 |

## 目标结构

```text
Desktop lifecycle / power monitor
              │
              ▼
      SchedulerRuntime (Core)
      ├─ clock + due queue
      ├─ fire-key dedupe
      ├─ in-flight guard
      ├─ backoff policy
      └─ run metadata
          │                 │
          ▼                 ▼
 UserScheduleOwner    PerceptionEmailOwner
 (OS.16 actions)      (SENSE.10 poll/route)
```

## 公共模型

```typescript
type ScheduleOwnerKind = 'user' | 'system';

interface RuntimeSchedule {
  id: string;
  owner: { kind: ScheduleOwnerKind; namespace: string; id: string };
  visibility: 'user' | 'internal';
  cadence: { type: 'once'; runAt: string } | { type: 'interval'; everyMs: number } | { type: 'cron'; expression: string; timezone: string };
  overlapPolicy: 'skip';
  missedRunPolicy: 'skip' | 'run-once';
  enabled: boolean;
  nextRunAt: string;
}

interface ScheduleOwnerPort {
  execute(input: { scheduleId: string; ownerId: string; fireKey: string; scheduledAt: string }): Promise<{ safeCode: string }>;
}
```

具体字段可在实施时与 OS.16 已有类型做兼容收敛，不要求复制一套任务模型。

## 生命周期与状态

1. Runtime 启动后加载用户任务；各系统 owner 幂等注册当前任务。
2. 单个短周期 timer 唤醒 due queue；业务执行异步进行，不阻塞 tick。
3. 执行前以 `scheduleId + scheduledAt` 生成 fire key，并检查 in-flight 与历史。
4. 成功后计算正常 next run；失败只更新该任务的退避状态。
5. Desktop suspend 时停止发起新执行，resume 后重新计算并应用 missed-run policy。
6. stop 时清除 timer，拒绝新执行，并对在途 Promise 做有界等待。

## 存储与日志

- 用户任务继续使用 `data/schedules/tasks.json` 与 `runs/{taskId}.jsonl`。
- 动态系统任务可由 owner 在启动时重建；若需持久化运行元数据，写入 `data/schedules/system-runs/{namespace}/{ownerId}.jsonl`。
- 系统日志仅包含 task ID、owner、fire key、时间、耗时、状态和安全错误码。
- 邮箱 secret、正文、附件内容以及未脱敏异常禁止进入调度日志。

## API 与状态方案

- Core 导出 Runtime 与 owner port；禁止 Core 依赖 Desktop、Web 或 Electron。
- Desktop 通过依赖注入装配时钟、电源事件和 owner。
- Web API 只调用 Core 公共 facade，并默认 `visibility=user`。
- 无需新增 Zustand 业务状态；现有定时任务 store 继续消费用户任务视图。

## 性能、安全与兼容

- 使用单一近端 timer/优先队列，禁止每个连接器创建独立永久 timer。
- owner 输入按 schema 校验，执行继承原 Agent/Skill/Project 权限和工作目录。
- 迁移保留 OS.16 任务文件格式；必要时采用读取旧格式、写入新版本的向后兼容迁移。
- 故障隔离粒度为 schedule ID，不允许单个 owner 异常终止主循环。

## AGENTS.md 合规证明

- 共享调度业务位于 Core Layer 2；Electron 仅负责环境装配，依赖方向为 Desktop → Core。
- Web App Router 不新增业务逻辑，组件不依赖 Desktop main。
- 数据继续使用本地 JSON/JSONL，不引入数据库或后端框架。
- 类型独立并通过模块 `index.ts` 暴露公共 API，不跨 feature 导入内部实现。
