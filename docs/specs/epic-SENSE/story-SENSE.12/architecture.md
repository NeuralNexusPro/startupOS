# SENSE.12 架构

## 决策与目录

新增 `packages/perception-plugins/` 存渠道实现；`packages/core/src/modules/perception-runtime/plugins/` 只存平台无关契约与 Host。实施时同步更新 AGENTS.md 项目地图。

```text
Web UI ─schema─▶ Plugin Catalog
Desktop Host ──▶ email/wecom/feishu/dingtalk plugins
 Credential/Event/Schedule/Network/Health Ports
                         │ submit(event)
                         ▼
              Perception Runtime → Rules → Targets
```

```text
packages/core/src/modules/perception-runtime/plugins/
packages/perception-plugins/{email,wecom,feishu,dingtalk}/
packages/desktop/src/main/services/perception-plugin-host/
packages/web/src/components/os/sense-center/plugin-config/
```

Manifest 声明 `id/version/hostApi/source/transport/capabilities/configurationSchema/permissions`；Plugin 实现 `provision/start/stop`。Host 注入最小权限 Ports，插件不得导入 Desktop/Web 内部文件。Webhook 经 Host adapter 定位插件；poll/stream 由 Desktop 托管。Connector JSON 增加 pluginId/pluginVersion，保留 source/id。

飞书桌面默认 transport 为 `stream`：插件使用飞书官方 Node SDK `WSClient` 主动建立长连接，SDK 负责鉴权、心跳和自动重连；无需公网域名、Verification Token 或 Encrypt Key。平台消息在插件内归一化后提交 Event Port，Assistant 输出通过 Reply Port 接入官方 `LarkChannel`：delta 由 SDK 的 Markdown CardKit stream 节流更新，终态关闭流式卡片；卡片调用失败时回退完整文本回复。

首期使用编译期白名单 catalog，不执行 data 目录任意 JS。Credential 按 plugin/connector 隔离；Host 校验事件和 capability。迁移采用双读旧/新、写新格式，回滚继续读旧字段且不删除凭据/游标。

依赖保持 `desktop/web → core modules → storage/shared/types`；插件只依赖 core 公共 SDK。无数据库、Express、Redux、CSS Modules 或 any，符合 AGENTS.md。

## SENSE12-T4：IM 文件回复

复用已授权的当前回复句柄。下层 Pi Agent AsyncLocalStorage 保存调用级 sender、可信会话目录与有效期；业务 send_file 工具检查文件后调用 sender。Perception 路由绑定句柄，Gateway 绑定持久化目录，Desktop Reply Service 保存无文件内容的投递回执，平台插件完成上传和发送。Plugin SDK 增加 outbound-files、文件回复事件和持久化后的 onAccepted；文件字节不进入 FlowPacket 或会话 JSON。详细契约见 OpenSpec add-im-file-replies/design.md。依赖保持业务层到集成层、Desktop 到 Core 公共 API，平台实现仅依赖 Plugin SDK。

## SENSE12-T5 流式积压修复

SENSE12-T5：共享派发器复用Node Readable进行有界预取，每组最多32个连续同flow/port/kind文本包。平台确认后逐原包保存回执，写盘异常不触发网络重发；企微确认后提交本地累积文本。无公共API/存储格式变化。
## SENSE12-T6 配置表单与事件刷新

SENSE12-T6：SenseCenter复用store现有引用计数刷新订阅，仅事件tab持有。顶部菜单仅首次load。五个无Hook列表采用render辅助函数，保持React表单类型与实例稳定，不新增状态或接口。

## SENSE12-T7：独立诊断出口

Desktop宿主拥有plugins/{插件名}/plugin-日期.log的异步文件写入，Core仅定义可选受控日志端口与错误诊断回调，插件通过公共SDK接入。Host绑定plugin/connector，调用级关联event/session，禁止全局当前插件变量。复用BufferedDailyLogWriter并补缓冲上限与故障可观测性。方案及脱敏、并发、恢复边界见[design](../../../../openspec/changes/isolate-perception-plugin-logs/design.md)。无数据库、反向依赖或业务状态新事实源；AGENTS v2.5.6已同步公共边界；钉钉使用pnpm锁定补丁注入实例logger，CJS/ESM和类型一致，飞书SDK数组参数由Host有界提取。
