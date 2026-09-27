# Tasks

## 1. 项目任务查询协议

- [x] 1.1 `943-T2-A`（串行；Protocol subagent；仅写 Core 跨包契约/服务、Desktop IPC controller 与定向测试）新增 `list_project_tasks` 的受控项目分页查询；验证无需 ontologyVersion、项目隔离、cursor/limit 与 unavailable 映射。

## 2. 桌面任务看板适配

- [x] 2.1 `943-T2-B`（串行；依赖 1.1；Web service subagent；仅写 `packages/web/src/services/project-task-board.ts` 与定向测试）实现 Desktop IPC 的任务列表、详情与控制适配，结构化映射 unavailable/冲突/拒绝；验证请求包含 projectId、requestId 和 expectedRevision。
- [x] 2.2 `943-T2-C`（串行；依赖 2.1；Workspace UI subagent；仅写 `packages/web/src/components/os/workspace/project-task-board/`、项目工作区入口与定向组件测试）实现看板分组、当前页筛选、详情、WorkItem 摘要、加载/空/失败状态及受控操作反馈；验证不生成本地任务状态且拒绝后保留权威投影。

## 3. 集成与验收

- [x] 3.1 `943-T2-D`（串行；依赖 2.2；Integration owner；写入 Story/OpenSpec evidence）在集成工作区合并不重叠变更，执行 Web 类型检查、定向组件/服务测试、lint、边界检查、strict validation 与 diff check；更新 Story 9.43 的真实完成项并清理 Task worktree。
