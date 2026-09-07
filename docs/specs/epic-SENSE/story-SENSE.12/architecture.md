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
