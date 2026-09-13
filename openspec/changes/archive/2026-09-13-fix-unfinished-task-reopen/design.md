## Context
用户澄清操作是回原历史会话后点击继续，不是普通入口自动查找任务。原Session GET已有restore与resume机制，AgentDialogContent已有任务卡，SkillDialog尚未接入。destroy未失效generation会产生退出迟到写失败。
## Goals / Non-Goals
原历史会话中呈现未完成任务与原进度，使用既有继续/重试/等待输入控制。保留原恢复策略：running按已有机制恢复；暂停/真实失败/等待状态不擅自执行。不改新建/历史选择、不新增自动查找。
## Decisions
SkillDialog复用现有useAgentTaskRuntime/AgentTaskCard，历史恢复后启用同会话任务状态订阅；继续操作保持taskId，聊天阻塞和等待输入沿用既有语义。销毁先递增generation，await持久化/task_next后检查代次再派发。
## Risks / Trade-offs
已完成步骤不重放，真正failed不伪装running。异步回复须属于当前恢复会话。退出后迟到回调不更改持久任务状态。
## Migration Plan
父代理文档/集成；runtime Task仅coordinator与测试；UI Task仅Web历史任务展示/控制与测试。无需session摘要/API或自动入口bootstrap；先前草拟自动查找方向不实施。
## Open Questions
用户已明确两种关闭方式及回原历史点击继续的交互。
