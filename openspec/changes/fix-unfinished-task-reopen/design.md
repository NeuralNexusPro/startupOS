## Context
原session GET已resumeAfterRestore，但普通入口初始activeSessionId=null，总创建新session。历史列表无任务摘要，不能逐个GET查找（会实际启动运行时）。destroy未失效continuationGeneration，旧异步回调可能误写failed。
## Goals / Non-Goals
重新进入原入口可恢复原未完成长任务和进度；running续跑，paused/failed/waiting_user保留状态与手动动作。显式新建/选择历史优先。不新增普通聊天工具调用的任意断点重放。
## Decisions
复用现有session列表生成经过schema/归属校验的任务摘要；UI一次bootstrap检查，选择最近匹配任务后恢复，空列表才新建。异步结果需遵守现有transitionGuard，不能覆盖显式选择；读取失败允许重试，不静默新建。Skill仅复用已有hook/panel恢复已有任务，不扩创建流程。
运行时销毁先递增现有generation；await持久化/task_next之后派发prompt前校验代次。保留原恢复门禁；失败/等待/暂停不自动执行。
## Risks / Trade-offs
跨entry不能恢复；无效版本保留原报错而不误启动。退出后迟到事件不得改写状态，真正失败不伪装成running。历史任务摘要只含必要状态，不含工具正文或秘密。
## Migration Plan
父代理文档/集成；runtime Task仅coordinator与其测试；UI Task负责session摘要/types与Web入口/panel/tests，不修改coordinator。独立工作树验证后集成、构建、合并、归档和清理。
## Open Questions
用户已明确两种关闭方式；仅对已创建且具有有效taskRuntime状态的长任务恢复。
