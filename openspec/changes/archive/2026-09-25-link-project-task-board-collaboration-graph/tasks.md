# Tasks

## 1. 图板共享状态

- [x] 1.1 `943-T4-A`（串行；依赖：943-T3；角色：Web graph subagent；写入：project task board 容器与组件测试）提升 page/detail/filter/selectedTaskId 为共享容器状态，实现看板/协同图切换且切换不清空选择、筛选或 revision。完成证据：`ProjectTaskBoard` 持有唯一 page/detail/filter/task/workItem selection，图板切换复用同一投影；组件测试验证筛选、taskId、revision 与详情在双向切换后保持。

## 2. 协同图

- [x] 2.1 `943-T4-B`（串行；依赖：1.1；角色：Web graph subagent；写入：project task collaboration graph 与测试）实现当前页 Task→WorkItem 最小图、绑定校验、双向定位、键盘节点和窄窗语义列表；验证跨 Task WorkItem 不混入。完成证据：原生 SVG 仅展示已加载 Task 与选中详情的 WorkItem；精确校验 project/task/revision/run binding，错误绑定显示结构化不可用且不绘制；所有节点使用原生 button 和可见焦点，WorkItem 选择同步详情高亮。

## 3. 验收

- [x] 3.1 `943-T4-C`（串行；依赖：2.1；角色：Integration owner；写入：evidence 与 Story 文档）执行 B01 图板一致矩阵和组件回归，运行 Web typecheck/lint、边界、自测、diff check 与 strict validation，记录当前页范围和后续依赖。完成证据：`evidence/943-t4-c-acceptance.md`；Web 2 files/15 tests、三包 typecheck、目标 lint 0 errors、边界 938/0、自测 43×2、diff check 与 strict validation 通过。
