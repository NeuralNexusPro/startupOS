# SENSE.12 需求

## 来源与详细需求

SENSE.3–6、SENSE.10–11 的渠道代码散落在 Core、Desktop、Web，配置 UI 包含平台硬编码。用户要求将邮件、企微、钉钉、飞书移入感知插件。

1. 定义版本化 Manifest、Plugin、RuntimeContext 和贡献点契约。
2. Host 负责发现、校验、注册、启停、健康和故障隔离。
3. 插件仅通过宿主 Port 使用凭据、事件、调度、网络和审计能力。
4. 配置 schema 只允许受控字段，不加载插件 React/HTML/脚本。
5. 四渠道迁为 bundled plugins，平台 SDK 由各插件拥有。
6. Secret 由 Credential Port 加密；配置和响应仅含引用/是否已配置。
7. 旧配置按 source 映射 plugin ID，保持 enabled、cursor、rule、grant、audit 关联。
8. 双工渠道必须将一次目标执行新增的全部 Assistant 文本按序回复到原会话；不得外发内部思考、工具参数和系统消息。

## Given / When / Then

- Given 合法清单，When Host 启动，Then 插件按 transport 注册且只获得声明权限。
- Given 清单/schema/capability 非法，When 发现，Then 拒绝该插件且其他插件继续。
- Given 用户选择插件，When 打开配置，Then UI 按 schema 渲染并统一 provision。
- Given 旧 Connector，When 首次加载，Then 稳定迁移且规则继续匹配。
- Given 插件越权或提交非法事件，When Host 校验，Then 拒绝并写脱敏审计。

## 边界、异常与依赖

Plugin ID、版本、入口和 schema 有界，禁止路径穿越/远程入口；单插件崩溃不阻塞其他插件。首期只支持随应用发布的可信 bundled plugins，第三方安装、签名和市场不在范围。不改变 Trigger Rule/授权语义。依赖 SENSE.1–11。

核心覆盖率 ≥80%，集成点 100%；配置渲染 <1 秒、发现 <500ms；仅 JSON 文件，不引入数据库或后端框架。
