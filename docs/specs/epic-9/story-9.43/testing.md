# 测试：项目任务看板

**状态：** 用例已规划，全部待执行；2026-09-14。

| ID | 层级 | Given / When | Then |
|---|---|---|---|
| B01 | Integration | 同一Task从图与看板读取 | task/run/workItem及revision一致 |
| B02 | Integration | 非授权项目ID请求列表/命令 | 拒绝且无数据泄露 |
| B03 | Integration | 重复requestId创建任务 | 只产生一个Task和绑定 |
| B04 | Unit/Integration | 缺证据或仍有Blocker，提交完成 | 门控拒绝，不改状态 |
| B05 | Component | 拖拽被拒绝 | 恢复原列，焦点与草稿保留，显示原因 |
| B06 | Integration | 两客户端对同revision发控制命令 | 后者冲突提示，不覆盖前者 |
| B07 | Integration | 运行中改负责人 | 先交接/失效旧lease，迟到结果拒绝 |
| B08 | E2E | 退出应用后回到原任务点击继续 | 由9.42恢复相同绑定，不重复Action/Evidence |
| B09 | Component | 任务暂停/失败、WorkItem完成但Task未完成 | 卡片展示正确执行徽标，不误入已完成 |
| B10 | Component | 键盘移动/操作任务 | 与鼠标走相同命令门控，焦点可见 |
| B11 | Integration | 索引删除后加载项目 | 从持久任务绑定重建，不复制Task状态 |
| B12 | Performance | 1000任务、多Agent状态更新 | 50条分页、只渲染当前页；按AGENTS交互指标实测 |
| B13 | Component | 同时后台刷新与编辑筛选/表单 | 保持输入；卸载不残留订阅 |
| B14 | E2E | 手动目标无已发布模板或语义输入缺失 | 明确设计/输入缺口，不生成临时执行拓扑 |

## 2026-09-22 T1 核心验收证据

- `pnpm exec vitest run --config vitest.config.ts src/lib/features/project/__tests__/task-board.test.ts`：4/4 通过，覆盖 B01/B06 的 Task/Run/WorkItem 同 revision 聚合、expectedRevision 冲突、requestId 幂等/冲突和项目越界拒绝。
- `pnpm exec tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint:boundaries`：907 个生产文件，0 条诊断。
- B03/B04/B07/B08/B11/B12/B14 与 Web UI/E2E 仍未执行，不标记 Story 完成。

先执行单测/接口测试，再组件测试，最后联通真实Task/Run及Windows/macOS恢复矩阵。故障注入复用主线E08–E11；API成功返回不能代替持久提交证据。测试数据使用临时项目，不操作真实外部IM。
