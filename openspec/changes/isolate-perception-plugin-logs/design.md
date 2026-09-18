## Context

当前SDK使用默认日志出口；StreamingSessionRuntimeAdapter丢弃prompt异常，ChannelTriggerExecutionAdapter抹去safeCode，PerceptionRouter只记录lease.failed。现有BufferedDailyLogWriter可复用日期路径、缓冲和flush；不能依靠事后解析desktop日志分流。

## Goals / Non-Goals

目标：四插件独立每日日志，定位连接、接纳、执行与回复失败，日志中保留安全原因及关联ID。
非目标：完整聊天/模型请求记录、远程日志平台、日志查看UI、自动重试业务操作或修复全部CHANNEL_RUNTIME_FAILED触发因素。

## Decisions

1. Desktop拥有文件写入：应用logs目录/plugins/{wecom|feishu|dingtalk|email}/plugin-YYYY-MM-DD.log，每行一个带时间的JSON对象。复用BufferedDailyLogWriter，最小扩展受控channel名称；普通desktop/llm日志继续现有路径。插件诊断不走全局console，不重复进入现有文件；共享Agent普通LLM日志仍按原配置，不要求本次迁移全部Agent日志。
2. Core Plugin SDK增加可选日志端口，Host将pluginId/connectorId绑定到上下文，插件不能指定路径或冒用其他插件。日志记录包含level、stage、safeCode、diagnosticId、可选eventId/sessionId/flowId及脱敏error摘要；先验证类型和长度，错误cause/stack有界。Plugin SDK不依赖Electron或Desktop，渠道运行时通过注入回调输出诊断，避免channel-runtime反向依赖perception实现。
3. 插件工厂在创建SDK client时注入logger；连接、鉴权、重连、接纳和回复异常捕获后写统一端口。关闭SDK原始协议/body调试日志。SDK若仅直写console，必须依据本地SDK能力采用局部适配或禁用其默认输出并补齐生命周期异常，禁止临时替换进程全局console导致跨插件串写。
4. Runtime在resolve、用户持久化、prompt、输出持久化/流消费阶段记录失败；保留异常并正确清理订阅/active，不能因诊断失败影响终态。每次调用显式绑定上下文，禁止用全局“当前插件”。错误仅一次产生诊断ID，路由审计关联同ID和safeCode；插件连接错误不需要会话也能落盘。IM只接受安全代码，不传堆栈、凭据或日志路径。
5. 白名单元数据与脱敏文本配合：不记录聊天/邮件正文、附件字节、完整请求、Authorization或授权码。错误cause/stack中的token、URL凭据及查询参数同样处理。复用现有脱敏能力并补不足，不直接JSON.stringify任意SDK错误。
6. 异步缓冲、按实际写入日期轮转、按序flush；为高频SDK重复日志设置有界队列与丢弃计数，不能无限排队或阻塞消息流。写盘失败返回可观测状态，不递归写日志、不抛进消息链；至多在系统日志记录一次不含插件内容的“插件日志写入不可用”告警。正常退出flush，强退允许损失尚未flush的缓冲，不声称日志可恢复业务状态。

替代方案：全局console按关键词拆分会错分并发消息且遗漏原因；新增日志框架或服务不必要；纯审计不能覆盖SDK连接诊断。选择宿主日志端口与现有文件写入器。

## Risks / Trade-offs

- SDK接口差异 → 实施前查本地类型与所有构造入口，每个插件默认工厂做测试，不能只mock工厂。
- 字段泄露 → 凭据/正文/cause/stack负向用例；关联ID只用内部opaque值。
- 异常本身复杂 → 有界摘要并保留安全分类，不保证恢复被旧版本丢弃的历史原因。
- 多进程混写 → 仅Desktop宿主写插件文件，worker传递诊断到宿主；若现有消息边界需增加字段须同时验证打包模块和进程出口。

## 实施分工

T1（串行，Core/Desktop子代理）：公共端口、调用错误关联、日志writer/宿主接线及对应测试；范围core和desktop。接口合入并冻结后，T2（插件子代理）只改wecom/feishu，T3（插件子代理）修改email/dingtalk及其专属SDK日志补丁、package.json补丁声明和pnpm-lock.yaml，T2/T3并行且各自独立worktree。父代理只集成、补文档、运行完整验收，不直接实施源码。

## Migration Plan

无用户数据迁移，现有审计保持权威；诊断是附加记录。更新AGENTS的Plugin SDK/日志边界说明和changes。发布验证Windows/macOS插件默认入口及日志目录；回滚整组SDK/宿主/插件改动，保留日志文件，不删除配置。

## Open Questions

无需要用户选择的产品问题。SDK logger适配和worker诊断现有端口由T1/T2/T3核对本地源码收敛，若超出本方案再记录变更。

### 实施核对：钉钉SDK日志出口

本地dingtalk-stream@2.1.7-beta.1在debug:false时仍直写console且无logger注入。T3沿用仓库pnpm patchedDependencies，为该锁定版本增加可选实例logger并替换SDK日志调用，默认logger维持console以兼容其他调用者；同步CJS/ESM和类型。补丁存patches，禁止把node_modules当源码入口。重装、CJS/ESM及实际包默认工厂验收必须覆盖。此为原方案SDK局部适配的具体实现，不增加新平台依赖或修改网络协议。

### 实施核对：SDK运行时依赖

四插件继续仅type import Core SDK。Host在ports.log上注入sdkLogger对象，插件不直接运行时导入Core日志helper，避免安装包解析Core的TypeScript源码出口。公共接口随34717f8合入，9c12153补充Lark嵌套数组参数有界提取；232项集成回归、真实SDK及macOS包验收通过。具体证据、覆盖率及Windows剩余人工验证见Story testing.md。
