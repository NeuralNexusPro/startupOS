# 实施：项目任务看板

**状态：** Done；2026-09-25，T1–T9 已完成。

## 里程碑与Task

- [x] 943-T1：Core 项目 Task 查询、权威投影与控制适配。任务源直接读取项目会话中的持久 Task Runtime 投影，索引缺失时按该投影重建；Run 只读关联，Desktop IPC 装配真实 source。pause/resume/retry/cancel 复用运行时公共控制端口，运行时未恢复时明确返回 unavailable。
- [x] 943-T2：已实现项目工作区任务页签、六状态看板、当前页搜索、详情/WorkItem 与 pause/resume/retry/cancel 反馈；列表、详情和控制均通过 Desktop IPC。Agent/优先级尚未进入权威摘要，界面明确提示未提供，不伪造筛选。图定位、键盘菜单、拖拽与 E2E 作为后续工作。
- [x] 943-T3：已实现版本化任务元数据、Run/WorkItem 执行摘要、Agent/优先级组合筛选、cursor 追加和 taskId/revision 合并；B09/B12 的 Core、组件与 1000 条性能 fixture 已验收。该 Task 不包含写优先级、图联动、交接、拖拽、任务创建或实时订阅。
- [x] 943-T4：已实现图板共享状态、当前页 Task→WorkItem 最小图、精确绑定校验、双向定位与原生键盘按钮语义；B01 已验收，图不维护第二事实源也不承担写操作。
- [x] 943-T5：已实现 targetStatus→公开 capability 的唯一解析、requestId/revision/lease CAS、Task Evidence/Blocker Gate，以及拖拽/键盘/操作按钮的统一 transition handler；B04、B05、B06、B10 已验收，拒绝时权威状态与用户交互上下文保持不变。
- [x] 943-T6：已实现 Core 原 Session/Task/Run 恢复端口和 Desktop 生产装配；恢复后重校验 revision/cursor/epoch/project/binding，paused、waiting_user、cancelled 均不自动执行。B08 故障注入证明响应前中断重放不重复 Action、Evidence、Fact 或 Agent 调用，恢复错误通过跨包协议稳定返回。
- [x] 943-T7：从已发布执行契约模板创建 Task/Run，精确绑定语义输入并保持 requestId 幂等；无模板或缺输入返回 DesignGap，不生成临时拓扑。
- [x] 943-T8：优先级与 WorkItem Agent 交接均走权威 CAS/lease 边界；UI 不做乐观写入，只合并服务端详情。
- [x] 943-T9：项目授权先于读取；Core 聚合项目级事件，Desktop 管理精确订阅生命周期，Web 处理 revision 与 host/sequence 缺口恢复。
- [x] ONT8-T1 已执行真实项目/多 Agent/中断恢复的联合自动化验收；实际 Windows/macOS 安装包矩阵继续由 ONT.8 4.3 跟踪。

每个Task一对一独立OpenSpec Proposal；先补齐具体接口和测试，批准后子代理在独立Task工作区实施，父代理集成。T1/T2有接口依赖，不同时改公共契约；接口冻结后的独立UI/adapter工作才可并行。

命令：沿用各包现有vitest定向测试、Web/Desktop类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test。仅规划文档阶段不运行应用回归，也不标记通过。

不引入Linear同步、自定义工作流或独立任务引擎；若业务要求这些能力，再单独扩展。
