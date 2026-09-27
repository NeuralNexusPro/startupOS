# 实施：项目任务看板

**状态：** In Progress；2026-09-24，T1 真实任务源与 Desktop 装配已完成，UI 未完成。

## 里程碑与Task

- [x] 943-T1：Core 项目 Task 查询、权威投影与控制适配。任务源直接读取项目会话中的持久 Task Runtime 投影，索引缺失时按该投影重建；Run 只读关联，Desktop IPC 装配真实 source。pause/resume/retry/cancel 复用运行时公共控制端口，运行时未恢复时明确返回 unavailable。
- [x] 943-T2：已实现项目工作区任务页签、六状态看板、当前页搜索、详情/WorkItem 与 pause/resume/retry/cancel 反馈；列表、详情和控制均通过 Desktop IPC。Agent/优先级尚未进入权威摘要，界面明确提示未提供，不伪造筛选。图定位、键盘菜单、拖拽与 E2E 作为后续工作。
- [ ] 由ONT8-T1执行真实项目/多Agent/中断恢复的联合验收；不能仅用UI mock宣称完成。

每个Task一对一独立OpenSpec Proposal；先补齐具体接口和测试，批准后子代理在独立Task工作区实施，父代理集成。T1/T2有接口依赖，不同时改公共契约；接口冻结后的独立UI/adapter工作才可并行。

命令：沿用各包现有vitest定向测试、Web/Desktop类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test。仅规划文档阶段不运行应用回归，也不标记通过。

不引入Linear同步、自定义工作流或独立任务引擎；若业务要求这些能力，再单独扩展。
