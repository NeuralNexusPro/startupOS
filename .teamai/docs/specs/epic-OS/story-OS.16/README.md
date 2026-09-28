# Story OS.16: 系统级定时任务与定时唤起能力

**Epic:** OS — Phase 0 OS 交互基础
**状态:** 📋 Planning
**优先级:** High（影响 Agent 主动服务、周期性工作流和桌面 OS 系统能力）
**估计工时:** 4-6 天
**依赖:** OS.7（Agent 托管服务）、OS.9（应用窗口系统）、OS.10（系统工具语义说明加固）、OS.14（Agent Runtime 工作目录与输出目录边界收敛）

---

## 用户故事

> 作为 OriginOS 用户，我希望系统能创建和管理定时任务，并在指定时间或周期自动唤起 Agent、Skill 或系统动作，这样我可以让 OriginOS 主动提醒、检查、汇总和执行周期性任务，而不需要一直手动触发。

---

## 背景与问题

OriginOS 已具备桌面、Dock、Agent 托管、应用窗口和多 Agent runtime 能力，但当前系统行为仍主要由用户实时点击或对话触发，缺少 OS 层面的“未来时间执行”能力。

典型需求：

- 每天固定时间唤起项目 Agent 汇总今日任务。
- 每周定时运行某个 Skill，生成报告或检查文件。
- 在指定日期提醒用户处理某个项目事项。
- 周期性检查外部状态，必要时打开 Agent 对话窗口并通知用户确认。

当前缺口：

- 没有统一的定时任务数据模型和存储目录。
- 没有系统级调度服务承载一次性任务、周期任务和错过任务恢复。
- Agent / Skill / 系统动作缺少统一的定时唤起入口。
- 桌面 UI 没有展示、暂停、恢复、删除定时任务的管理面板。
- 桌面端打包后需要处理应用未运行、睡眠唤醒、时区变化等运行时问题。

---

## 目标架构

### 系统能力定位

定时任务是 OS 系统能力，不属于单个 Agent、Skill 或项目内部实现。

```text
用户 / Agent / Skill
  -> 创建 Schedule
  -> System Scheduler 持久化任务
  -> 到期触发 Wakeup Event
  -> 唤起 Agent / Skill / System Action
  -> 记录执行结果与下一次触发时间
```

### 调度对象模型

```typescript
interface ScheduledTask {
  id: string;
  title: string;
  description?: string;
  status: 'enabled' | 'paused' | 'completed' | 'failed';
  trigger: ScheduleTrigger;
  action: ScheduledAction;
  timezone: string;
  nextRunAt: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

type ScheduleTrigger =
  | { type: 'once'; runAt: string }
  | { type: 'interval'; everyMs: number; startAt?: string; endAt?: string }
  | { type: 'cron'; expression: string };

type ScheduledAction =
  | { type: 'agent'; agentName: string; prompt: string; projectId?: string }
  | { type: 'skill'; skillName: string; prompt?: string; projectId?: string }
  | { type: 'system'; command: 'open-window' | 'notify' | 'check-update'; payload?: Record<string, unknown> }
  | { type: 'system-tool'; toolName: string; input: Record<string, unknown>; projectId?: string };
```

### 系统工具调用

定时任务模块必须支持通过系统工具执行受控动作，但该能力必须走 OriginOS 既有工具注册、权限和 schema 校验机制。

系统工具调用边界：

- `system-tool` 只能调用已注册、允许定时执行的系统工具。
- 每个可定时执行的系统工具必须在 registry 中声明 `schedulable: true` 或等价元数据。
- 调用前必须使用工具 schema 校验 `input`，禁止将任意 JSON 直接透传到执行层。
- 执行时必须继承任务所属 Agent / Skill / Project 的 `workingDirectory` 和权限边界。
- 高风险系统工具必须要求用户确认，定时任务只能唤起确认窗口，不能静默执行。
- 禁止将任意 shell 命令、脚本片段或未注册工具作为 `system-tool` 动作。

示例：

```typescript
const scheduledAction: ScheduledAction = {
  type: 'system-tool',
  toolName: 'read_office_document',
  input: {
    path: 'reports/weekly.xlsx'
  },
  projectId: 'project-123'
};
```

### 存储目录

定时任务属于运行时系统数据，存储在：

```text
data/schedules/
├── tasks.json
├── runs/
│   └── {taskId}.jsonl
└── locks/
```

要求：

- `tasks.json` 必须符合项目 JSON 数据格式约束，包含 `version`、`createdAt`、`updatedAt`、`data`。
- 每次触发写入 `runs/{taskId}.jsonl`，记录开始时间、结束时间、动作类型、结果、错误摘要。
- `.claude/skills/` 仍为只读技能源目录，定时 Skill 的产物输出必须遵守既有 `data/skills/{skillName}/` 或项目工作目录规则。

---

## 范围

### A. 调度服务（必须）

- [ ] 新增系统级 Schedule Service，负责加载、保存、计算下一次触发时间。
- [ ] 支持一次性任务。
- [ ] 支持固定间隔任务。
- [ ] 支持 cron 表达式任务。
- [ ] 支持启用、暂停、恢复、删除任务。
- [ ] 支持应用启动时恢复未完成任务并处理 missed run 策略。
- [ ] 支持时区字段，默认使用系统时区。

### B. 定时唤起执行器（必须）

- [ ] 支持唤起内置 Agent，并注入定时任务 prompt。
- [ ] 支持唤起项目上下文 Agent，工作目录使用项目 `currentPath`。
- [ ] 支持唤起 Skill，产物输出目录遵守既有技能目录规则。
- [ ] 支持系统动作：通知用户、打开窗口、检查更新。
- [ ] 支持通过 `system-tool` 动作调用已注册且允许定时执行的系统工具。
- [ ] 系统工具调用前必须完成工具存在性、schedulable 元数据、schema input 和权限校验。
- [ ] 对需要用户确认的动作只打开提示或 Agent 窗口，不静默执行高风险操作。
- [ ] 每次执行写入 run log，失败不阻塞主应用启动。

### C. API 与工具入口（必须）

- [ ] 提供 Schedule CRUD API 或 Electron IPC facade。
- [ ] Agent 工具箱只新增安全的 `schedule_task` / `run_schedule_now` 能力，避免工具面过宽。
- [ ] 工具 schema 明确说明定时任务不会绕过权限和工作目录边界。
- [ ] 定时任务 API 必须支持创建 `system-tool` 类型动作，但只能引用白名单系统工具。
- [ ] 禁止工具接受任意 shell 命令作为定时动作。

### D. 桌面 UI（必须）

- [ ] 右上角系统图标区新增“定时任务”图标入口，点击后打开独立定时任务对话框。
- [ ] 展示任务标题、状态、下一次运行时间、动作类型、最近结果。
- [ ] 支持暂停、恢复、删除任务。
- [ ] 支持手动立即运行一次。
- [ ] 定时唤起时通过 OriginOS 通知中心、桌面系统级通知或桌面窗口明确告知用户来源任务。

### E. 可靠性与安全（必须）

- [ ] 应用重启后保留任务并恢复调度。
- [ ] 机器睡眠后醒来时重新计算到期任务。
- [ ] 系统时间或时区变化后重新计算 `nextRunAt`。
- [ ] 同一任务同一触发点不得重复执行。
- [ ] 定时任务不得写入 `.claude/skills/`。
- [ ] 定时执行必须继承对应 Agent / Skill 的权限模型和工作目录边界。
- [ ] 定时执行系统工具时必须继承系统工具 registry 的权限、scope 和 schema 约束。

### F. 后续增强（非首期）

- [ ] 自然语言创建复杂日程，例如“每个工作日下午 6 点”。
- [ ] 多设备同步定时任务。
- [ ] 任务失败重试策略配置。
- [ ] 条件触发，例如文件变化、外部 API 状态变化。
- [ ] 定时任务运行统计和健康看板。

---

## 非目标

- ❌ 不实现任意 shell 命令的后台定时执行器。
- ❌ 不支持调用未注册或未声明为可定时执行的系统工具。
- ❌ 不绕过用户确认执行高风险文件、网络或系统操作。
- ❌ 不引入数据库，MVP 继续使用本地 JSON 文件系统。
- ❌ 不把定时任务实现为某个单一 Agent 的私有能力。
- ❌ 不在应用未安装系统级后台服务时承诺关机状态下执行。

---

## 验收标准

1. - [ ] 用户可以创建一次性定时任务，并在到期后看到 Agent / Skill / 系统动作被唤起。
2. - [ ] 用户可以创建周期性任务，系统能正确计算并展示下一次运行时间。
3. - [ ] 应用重启后，已启用任务仍存在并继续调度。
4. - [ ] 任务执行结果会记录到 `data/schedules/runs/{taskId}.jsonl`。
5. - [ ] 暂停任务后不会触发，恢复后重新计算下一次触发时间。
6. - [ ] 删除任务后不会再被调度。
7. - [ ] 定时唤起 Agent 时使用正确的 Agent / Project 工作目录。
8. - [ ] 定时唤起 Skill 时不会向 `.claude/skills/` 写入产物。
9. - [ ] 睡眠唤醒或应用重启导致错过触发时间时，系统按明确策略处理且不重复执行同一触发点。
10. - [ ] 无效 cron、过去时间、缺失 Agent / Skill 等错误能被 UI 和 run log 清晰呈现。
11. - [ ] 定时任务可以调用已注册且允许定时执行的系统工具，并正确写入执行结果。
12. - [ ] 未注册、未声明可定时执行、schema 校验失败或权限不足的系统工具调用会被拒绝，且不会进入执行层。
13. - [ ] 桌面版可通过 Electron 主进程触发系统级通知，浏览器版不支持时可安全降级。

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| ADD | `packages/core/src/modules/scheduler/types.ts` | 定时任务、触发器、动作和执行记录类型 |
| ADD | `packages/core/src/modules/scheduler/schedule-store.ts` | 基于 JSON 文件系统的任务持久化 |
| ADD | `packages/core/src/modules/scheduler/scheduler-service.ts` | 调度计算、定时器管理、恢复和 missed run 处理 |
| ADD | `packages/core/src/modules/scheduler/action-runner.ts` | Agent / Skill / system action 唤起执行器 |
| ADD | `packages/core/src/modules/scheduler/system-tool-runner.ts` | 定时任务调用系统工具的白名单、schema 和权限校验适配层 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools` | 增加安全的定时任务工具入口 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/tools/registry` | 为允许定时执行的系统工具声明 schedulable 元数据 |
| MODIFY | `packages/desktop/src/main` | 接入桌面端应用启动、睡眠唤醒和 IPC |
| MODIFY | `packages/web/src/app/page.tsx` | 在右上角系统图标区挂载定时任务入口 |
| MODIFY | `packages/web/src/components/os/StatusBar/index.tsx` | 为状态栏场景挂载定时任务入口 |
| ADD | `packages/web/src/components/os/schedules` | 定时任务列表、编辑、运行记录组件 |
| ADD | `data/schedules/.gitkeep` | 运行时目录占位，不提交用户任务数据 |
| ADD | `docs/specs/epic-OS/story-OS.16/test-plan.md` | 定时任务测试计划 |

---

## 与其他 Story 的关系

- **OS.7 Agent 托管服务**：定时任务通过既有 Agent 托管能力唤起 Agent，不复制 Agent runtime。
- **OS.9 应用窗口系统**：定时唤起可打开 Agent 窗体、定时任务对话框或系统通知。
- **OS.10 系统工具语义说明加固**：新增 schedule 工具必须有清晰 schema；`system-tool` 动作必须复用系统工具 schema description 和 registry 元数据，明确哪些工具允许定时执行，避免 Agent 误用为后台 shell。
- **OS.12 系统级 Office 文件读取能力**：周期性报告类任务可组合文档读取能力，但文件边界仍由工作目录约束。
- **OS.14 工作目录与输出目录边界收敛**：定时执行器必须只向工具层传入 `workingDirectory`，输出目录语义留在 runtime / prompt 层。
- **Epic C 认知系统**：定时任务执行记录可作为实践日志来源，但首期不自动沉淀知识或模式。

---

## 测试建议

- 单元测试覆盖 trigger 解析、`nextRunAt` 计算、暂停恢复、missed run 策略。
- 集成测试覆盖任务持久化、应用重启恢复、Agent / Skill action runner。
- E2E 测试覆盖 UI 创建任务、立即运行、暂停、恢复、删除。
- 桌面端手测覆盖睡眠唤醒、系统时间变化、通知权限关闭等场景。
