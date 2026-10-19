# Design

## Context

方案设计目前通过 Pi Agent 在 Stage 4 同一轮内写入三份方案 JSON、Agent 工程和全部 Skill。`project-skill-creator` 已复制到项目，但不存在独立 `invoke_skill` 运行边界；创建过程没有步骤账本，也无法在应用退出后恢复。详见 proposal.md。

实现必须位于 `packages/core/src/lib/features/project/` 的公共业务边界，Web API 只负责参数和响应映射。状态继续使用本地 JSON 文件，不引入数据库。后台物化状态是内部基础设施事实，不属于 collaboration-runtime 的业务 Task/Run/WorkItem。

## Goals / Non-Goals

**Goals:**
- 建立版本化、幂等、可恢复的方案物化任务及步骤账本。
- 把 Agent、Skill 和最终校验拆成独立步骤。
- 让调用方能够启动、查询和恢复后台任务，但不污染任务看板。
- 修正 Skill 引用不存在的 `references/ontology-tools.md`。

**Non-Goals:**
- 不改变项目任务看板或协同运行时状态机。
- 不为简单 Skill 强制生成无用脚本、资产或说明文件。
- 不在本任务中引入通用分布式队列。

## Decisions

### 1. 使用 Project feature 内部 JSON 任务账本

状态写入 `projects/{projectId}/solutions/{solutionVersion}/materialization-task.json`，以 projectId + solutionVersion 形成唯一任务。写入采用临时文件加 rename，步骤包含 pending/running/completed/failed、attempts、error 和 artifacts。

选择该方案是因为它符合现有文件存储约束，并与业务任务看板隔离。替代方案是复用 collaboration WorkItem；该方案会把内部构建任务暴露到看板并混淆用户下发任务语义，因此拒绝。

### 2. 服务提供启动、单步推进和恢复边界

Core 服务负责读取并验证三文件、规划步骤、claim 下一步、记录完成/失败、恢复遗留 running 状态以及最终确定性校验。执行器通过依赖注入消费 Agent/Skill 规格，便于 Desktop 后台调度或 Pi Agent 工具接入，Core 不依赖 Electron。

### 3. 生成步骤以目录和内容摘要幂等

每步冻结输入 SHA-256；已经 completed 且输入摘要和产物摘要一致时跳过。输入变化必须创建新方案版本或显式重建，禁止静默覆盖已确认版本。

### 4. Skill references 是条件产物

SKILL.md 引用 `references/ontology-tools.md` 时，步骤必须从项目的 `skills/project-skill-creator/references/ontology-tools.md` 复制到 Skill 自身目录。其他 references/scripts/assets 仅在 outline 明确需要时生成。

### 5. 看板隔离通过类型和存储位置保证

物化任务类型不导出为 ProjectTask，不写 collaboration-runs，不进入 task-board source。解决方案 UI 可通过独立 API 查询摘要状态。

## Risks / Trade-offs

- [进程内后台执行在强制退出时中断] → 每步先持久化 claim，启动时把过期 running 恢复为 pending。
- [模型生成结果不确定] → 每步独立重试，最终通过确定性契约与文件校验；不把“写入成功”视为完成。
- [多个窗口重复启动] → 任务 ID 唯一并使用 revision/claim token 防止并发步骤重复提交。
- [旧方案已存在半成品] → 首次任务按摘要检查并接纳通过验证的现有文件，其余步骤补齐。

## Migration Plan

1. 增加 Core 任务类型、存储、规划与校验测试。
2. 增加启动/查询 API 和后台执行适配。
3. 更新 solution-design Stage 4：写完 confirmed 三文件后只启动后台物化，不再在当前轮批量写文件。
4. 保留现有 Agent/Skill 文件读取兼容。
5. 回滚时停止新任务入口并恢复旧指令；任务 JSON 不参与运行授权，可安全保留。

## 实施边界

- Core Task 可独立修改 `packages/core/src/lib/features/project/` 及其测试。
- Web/Prompt Task 可独立修改 solution API、solution-design 模板和对应测试。
- 两者通过 Core 公共 API 连接，禁止 Web 复制任务状态与校验逻辑。
