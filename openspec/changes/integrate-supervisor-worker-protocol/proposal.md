# 协同协议运行时接入

## Why
0.4.x 审计确认 9.36 尚未形成完整产品能力，需要补齐真实入口并验证，而不是只保留孤立组件。

## What Changes
- epic-id: 9；story-id: 9.36；task-id: 936-T1；owner: Codex。
- 来源：docs/specs/epic-9/story-9.36/README.md。
- 将 Supervisor 心跳、Worker 进度、阻塞/完成汇报、依赖检查接入真实协同执行路径。
- 提供按会话读取任务快照的公共 facade/API，恢复后仍可读，包含活跃和每 Agent 最近终端任务。
- 提供结构化记忆索引和实际能力/负载匹配；暂停、异常、取消和结束必须清理计时器。
- 对齐 9.42 Run/WorkItem 权威状态，诊断快照不可伪造业务完成。
- 用户已以“帮我按照这个推进吧”批准审计建议；采用 0.4.x 为集成线，本轮不推送、不打包、不清理现场。

## Capabilities
### New Capabilities
- `collaboration-supervisor-worker-observability`: 协同协议运行时接入。
### Modified Capabilities
无；复用既有语义校验、发布和执行门控。

## Impact
- 写入范围 core modules/collaboration-runtime、Web collaboration snapshot route/适配、必要 Desktop collaboration service/IPC、9.36 文档与测试；禁止修改 P2.6/P2.7 文件。
不引入数据库或依赖。非目标：修改本体权限、静默迁移、发布打包。依赖既有 P2.8/ONT.7/9.42 公共接口；实现与另两任务文件独立可并行，最终集成按 P2.6→P2.7→9.36 串行回归。上线为本地 0.4.x 合并；回滚撤回提交，不删除用户数据。
