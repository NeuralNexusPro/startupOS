# ONT.8 交互设计

**Story:** Cross-package Adapters 与端到端验证  
**版本:** 0.1.0  
**最后更新:** 2026-09-19

## 适用性

ONT8-T1 不新增独立页面、视觉组件或工作流。它保证既有访谈、Solution 发布、项目任务看板、任务详情和“继续任务”在 Web 与 Desktop 使用同一后端语义。本文件定义跨页面的可观察状态与错误反馈；具体布局归 P2.8、9.42、9.43。

## 主流程

```text
完成访谈并确认概念
  -> 检查并发布 SolutionExecutionContract
  -> 从已发布版本创建正式 Task
  -> 启动绑定的 Run/WorkItems
  -> 展示进度、阻塞、审批和产物
  -> Verifier 通过并登记 Evidence
  -> Evidence Gate 决定 Task 是否完成
  -> 中断后从原 Task 继续或核对
```

Web 与 Desktop 的可用动作、结果和错误文案语义一致；平台外壳可以使用各自导航方式，但不得改变业务状态。

## 状态与反馈

| 状态 | 用户可见反馈 | 可用动作 |
|---|---|---|
| 前置能力不可用 | “项目语义执行能力尚未就绪”，列出缺失 capability/version | 返回设计或查看诊断；不启动 |
| 设计缺口 | 定位 concept/node/fact/action/verifier 缺口 | 返回访谈/方案设计修复 |
| 启动中 | 显示绑定的 solution version、ontology version，不乐观进入运行中 | 取消请求 |
| 运行中 | Task 卡片显示 Run/WorkItem、revision、当前 Agent 与可用操作 | 暂停、查看详情、按门控取消 |
| 等待审批/用户 | 保留原请求、来源与恢复入口 | 审批、补充信息、取消 |
| 冲突 | “任务已在其他位置更新”，恢复原控件状态并刷新权威 revision | 复核后重试 |
| 待人工核对 | 明确外部操作结果未知，禁止自动重发 | 查看回执/来源，人工确认 |
| 已暂停 | 显示暂停点与 checkpoint，不在重启后自动继续 | 明确点击继续 |
| 已取消 | 显示终止与迟到结果被忽略 | 查看历史，不提供继续 |
| 已完成 | 仅在 Evidence Gate 通过后进入完成 | 查看 Evidence 与产物 |

## 中断恢复流程

1. 用户关闭窗口或应用后重新进入原项目。
2. 系统加载 Task/Run 绑定和最新可核对 receipt，不创建新 Task 或 Run。
3. 对 paused、waiting approval、manual reconciliation 分别显示原状态。
4. 用户明确选择“继续”时，使用原 contract/ontology version 与新 attempt/lease 恢复。
5. 若 snapshot 或权威 ledger 损坏，显示阻塞原因和诊断引用，不猜测完成状态。

## 错误文案原则

- 说明“发生了什么、哪些内容未写入、用户下一步能做什么”。
- 版本冲突显示当前版本与请求版本的安全标识，不显示文件路径。
- 权限失败不透露项目、实体、fact 或 task 是否存在。
- 内部错误显示 diagnostic ID；凭据、prompt、正文、附件与工具输出不进入提示。
- transport 不可用可建议重试；业务拒绝和未知副作用不得建议盲目重试。

## 响应式与可访问性

本 Story 不改变页面布局。P2.8/9.43 的现有键盘操作、焦点管理、ARIA live region 和 WCAG AA 要求继续适用：冲突或恢复后焦点返回触发控件，错误通过文本而非仅颜色表达，Web 与 Desktop 的键盘命令必须走相同服务端门控。

## 非目标

- 不提供新的看板、图谱、访谈或方案编辑 UI。
- 不用 toast 成功代替持久 receipt。
- 不在客户端本地修改 Task/Run/ontology 状态后再异步补写。

## 变更历史

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-19 | 0.1.0 | 定义跨平台状态、错误反馈与恢复交互 |

