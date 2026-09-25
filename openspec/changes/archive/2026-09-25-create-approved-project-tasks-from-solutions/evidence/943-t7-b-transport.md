# 943-T7-B Transport 证据

- Core contract/service 暴露 `list_approved_task_templates` 与 `create_approved_project_task`，生产 composition 将只读发布目录和 `ApprovedProjectTaskCreationService` 注入同一服务。
- catalog 仅返回 contract/template、ontology slot 与 Fact policy 摘要；不返回完整拓扑、权限、创建时间、文件路径或内部诊断。
- 创建失败将 Core `DesignGap` 原样保存在 `error.designGaps`，Desktop IPC 与 Web route 不改写业务错误。
- Web task board service 只提交精确 contract/template/semantic binding，并仅接受带权威 Task/Run/binding 的成功响应；客户端不创建临时卡片。
- 定向验证：Core 26 tests、Desktop 18 tests、Web 29 tests 全部通过；Core/Desktop/Web TypeScript strict typecheck 通过。
