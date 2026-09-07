# SENSE.12 测试

自动化验证 Goal：通过 SENSE.12 的 Plugin Contract、Host 生命周期、声明式配置、安全隔离和四渠道迁移用例。

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| S12-UT-01 | Core | manifest/schema 边界 | 合法注册；非法版本、路径、字段、capability 拒绝 |
| S12-UT-02 | Core | 权限 context | 只能调用声明且获批的 Port |
| S12-IT-01 | Host | discover/start/stop/restart | 幂等，无 timer/socket 泄漏 |
| S12-ISO-01 | Host | 单插件崩溃 | 其他插件继续，健康和审计脱敏 |
| S12-SEC-01 | Desktop | 四插件 Secret | 仅经 IPC/safeStorage，配置/日志/响应不可检索 |
| S12-UI-01 | Web | 四 schema 渲染 | 无平台条件组件，字段、错误、可访问性正确 |
| S12-UI-02 | Web/Core | 连接器范围目标授权 | 创建规则时只展示允许当前连接器的目标；为同一目标追加连接器授权时合并而非覆盖已有授权；不匹配的规则在保存阶段拒绝 |
| S12-MIG-01 | Core | 旧配置迁移 | ID/source/enabled/secret/cursor/rule 保持且幂等 |
| S12-PLG-01 | Plugin | Email | 增量、正文和故障语义保持 |
| S12-STATE-01 | Core/Desktop | 插件私有状态 | Email 游标仅能经按 plugin/connector/key 隔离的 State Port 读写，拒绝路径穿越和跨连接器访问 |
| S12-PLG-02 | Plugin | WeCom | 消息、重连、去重保持；使用原始 SDK frame 将本次目标执行的全部 Assistant 文本按序回复，且只在末段结束 stream |
| S12-PLG-03 | Plugin | Feishu | WebSocket 入站保持；Agent `text_delta` 通过官方 SDK Markdown CardKit 节流流式更新，完成态收口；无 delta 的 Markdown 回复以卡片渲染；CardKit 失败降级为普通文本且回复不丢失 |
| S12-PLG-04 | Plugin | DingTalk | 认证、回调、ACK 保持 |
| S12-PKG-01 | Packaging | Windows/macOS | bundled catalog 与依赖完整 |
| S12-DEP-01 | Architecture | lint/madge/import scan | 无循环、反向依赖、平台分支 |

执行 Core/Desktop/Web/四插件 Vitest、typecheck、lint、循环依赖、Windows 打包和脚本化验收。真实平台测试记录人工步骤、脱敏证据和风险。实施完成后必须创建并完成本 Story 自动化验证 Goal。

## 2026-09-04 企微首插件验证

- Core Plugin Host：6 项测试通过；企微既有协议回归：6 项通过。
- WeCom plugin：manifest、文本/语音归一化、Secret Port、socket 生命周期共 6 项通过。
- Core/Web typecheck 与 Desktop build 通过；相关 ESLint 0 error（保留既有 warning）；`git diff --check` 通过。
- 依赖扫描确认通用 Host/Registry 无渠道名称分支，企微官方 SDK 仅由 `@originos/perception-plugin-wecom` 持有；Electron 打包清单显式包含插件和 SDK。
- 尚未使用真实 Bot ID/Secret 联机，Windows 打包态和企微服务端连接作为 S12-T7 人工/打包验收剩余项。

## 2026-09-07 飞书插件验证

- 飞书插件覆盖受控 manifest、官方 SDK WebSocket 生命周期、自动重连健康、消息归一化、事件提交和原消息双工回复。
- 插件不再导入 Core 飞书 Connector；平台逻辑只依赖 Core 公共 Plugin SDK。
- 飞书配置表单测试通过；飞书插件 WebSocket、Markdown 和流式卡片专项 7 项通过。
- 已移除默认 Webhook 回环桥和 Verification Token/Encrypt Key 配置；桌面模式无需公网域名。
- 真实飞书 App ID/App Secret 尚未联机；仍需在飞书后台选择长连接、订阅 `im.message.receive_v1`、授予消息权限并发布应用。

## 2026-09-07 飞书流式 Markdown 验收补充

- Agent delta 必须在目标执行期间进入同一张飞书 Markdown 卡片，`completed` 后关闭流式状态。
- 最终 Assistant 消息不得与已流式输出重复发送；没有 delta 时直接发送 Markdown 卡片。
- CardKit 创建或更新失败时，必须使用完整累积文本回退到普通文本回复。

## Email 插件迁移验收补充

- 首次启用以邮箱当前 UID 头为基线，不回放历史邮件；后续仅提交增量邮件。
- UIDVALIDITY 改变时安全重置游标；正文、主题、发送者和受控附件引用保持现有语义。
- 凭据只经 Credential Port，游标只经隔离 State Port；插件不得直接读写 OriginOS 数据目录。
- 停用或停止插件后取消轮询，不遗留 timer；单次 IMAP 失败只更新脱敏健康状态，下轮可恢复。

## 2026-09-07 S12-T3 声明式配置验证

- Core Host provisioning 测试覆盖 plugin provision 调用、权限裁剪及无 provision 插件的通用回退。
- Web 表单只读取 manifest `configurationSchema`，覆盖 text/password/number/boolean/select，并验证敏感字段与普通 settings 分离后经统一 IPC 提交。
- Email 与 WeCom 插件测试覆盖凭据 Port；Email 在写入凭据前执行 IMAP 连接验证，WeCom 保存兼容运行时的 transport 配置。
- 已删除 Email、WeCom、Feishu 的专用 provisioning IPC、Desktop service 与 Web service，静态扫描无旧通道引用。
- Email 插件已内聚配置类型与校验，编译产物不再包含对 Core Email integration 源码的运行时导入；覆盖 Windows Electron `ERR_MODULE_NOT_FOUND` 回归。
