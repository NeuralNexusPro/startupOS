# 实施：项目任务看板

**状态：** In Progress；2026-09-22，T1 公共投影边界已实现，真实数据源与 UI 未完成。

## 里程碑与Task

- [ ] 943-T1：core项目Task查询索引、权威投影与控制适配；已完成公共投影/控制边界与项目隔离、requestId 幂等、revision、Run/WorkItem 联动测试，真实 pi-tasks source、持久索引与重建仍待接入。
- [ ] 943-T2：在接口冻结后实施Web看板/详情、Agent筛选、图板定位、键盘及拖拽命令反馈；完成组件与E2E。
- [ ] 由ONT8-T1执行真实项目/多Agent/中断恢复的联合验收；不能仅用UI mock宣称完成。

每个Task一对一独立OpenSpec Proposal；先补齐具体接口和测试，批准后子代理在独立Task工作区实施，父代理集成。T1/T2有接口依赖，不同时改公共契约；接口冻结后的独立UI/adapter工作才可并行。

命令：沿用各包现有vitest定向测试、Web/Desktop类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test。仅规划文档阶段不运行应用回归，也不标记通过。

不引入Linear同步、自定义工作流或独立任务引擎；若业务要求这些能力，再单独扩展。
