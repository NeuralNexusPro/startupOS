# 943-T4-C 验收证据

**日期：** 2026-09-25  
**范围：** Story 9.43 B01 图板同源、Task→WorkItem 绑定和双向定位。

## 同源与选择

- 看板和协同图直接消费 `ProjectTaskBoard` 内同一份 `ProjectTaskPage`、筛选结果、`ProjectTaskDetail` 与选择状态，不创建第二查询或浏览器持久状态。
- 组件测试从 revision 2 的 Task 卡片进入详情，切换图后仍定位 `task-active · r2`，选择 WorkItem 后详情对应条目得到 `aria-current`，切回看板后保持筛选与选择。

## 绑定与可访问性

- 只有 projectId、parentTaskId、taskRevision 与 runId 精确匹配的 WorkItem 才进入 SVG 和语义节点列表。
- 错误 parentTaskId 的 WorkItem 触发“协同关系不可用”告警，并从图节点移除。
- Task 和 WorkItem 节点均为原生 `button`，具备 `aria-pressed` 与可见 `focus-visible`；Enter/Space 使用浏览器原生按钮语义。

## 自动化结果

| 检查 | 结果 |
|---|---|
| Web service/component | 2 files / 15 tests passed |
| Core/Web/Desktop typecheck | passed |
| 目标 ESLint | 0 errors（存量 warning 保持 warning） |
| `pnpm lint:boundaries` | 938 production files / 0 diagnostics |
| 架构检查器 self-test | 43 cases × 2 CWD passed |
| `git diff --check` | passed |
| OpenSpec strict validation | passed |

当前图只展示已加载 cursor 页；加载更多后复用同一 page 合并结果增量出现节点。图中不提供写操作，受控状态迁移由后续 T5 完成。
