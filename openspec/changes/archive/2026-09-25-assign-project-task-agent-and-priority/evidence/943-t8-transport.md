# 943-T8-C 跨包传输证据

- `update_project_task_priority` 逐字段传递 Task revision、cursor 与 bridge epoch；Core 在解析原 Session 后调用 Task Runtime 公共 metadata mutation port，并返回持久幂等 receipt 与权威 Task detail。
- `list_work_item_handoff_candidates` 只返回冻结契约与权限交集提供的稳定 Agent ID、展示名与权限。
- `handoff_work_item` 同时传递 Run revision、WorkItem revision 与 lease epoch；Core 返回 handoff receipt 和更新后的权威 Task detail。
- Desktop IPC 只校验传输形状并覆写可信 sender actor；Web service 只发送意图、校验响应形状并保留 Core 的结构化冲突。
- Core service、Desktop IPC、Web service 测试覆盖三种请求的字段等价性、权威返回与候选来源。
