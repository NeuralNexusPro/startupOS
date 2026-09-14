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

## SENSE12-T4：IM 文件回传
用户确认先支持 IM 对话中发回当前会话。Agent/Skill 可显式调用 send_file 发出工作目录中的已生成资产；无收件人选择，不自动外发所有文件。Given 当前授权IM调用及真实会话目录，When 发送受支持普通文件，Then 原会话收到平台接受的文件消息且工具返回成功。跨目录、无上下文、超限、平台拒绝时必须明确失败。文件不超过20_000_000字节，钉钉限官方sampleFile格式；其他格式提示先生成ZIP。并发、停止、重复请求与落盘ACK见testing.md TC1-13。

## SENSE12-T5 流式积压修复

SENSE12-T5：企微输出积压时合并连续文本，保留原始回执、顺序和错误语义；首片不增加等待。
## SENSE12-T6 配置表单与事件刷新

SENSE12-T6：仅事件记录页定时刷新；配置、目标权限、规则、健康页及顶部状态栏不维持轮询。首次加载、手动刷新及保存/启停后更新保留。必要store更新不得重建表单。

## SENSE12-T7：插件日志隔离

来源：2026-09-14用户要求。AC1：插件与SDK日志按插件每日独立文件，不重复进desktop/llm。AC2：连接/接纳/执行/投递异常有脱敏原因、阶段、诊断ID和可用会话/事件关联，审计保留引用。AC3：Host绑定归属，禁止正文、凭据和任意路径。AC4：有界异步写入、轮转、退出flush、写盘故障不改变聊天结果。具体Given/When/Then见testing.md PL01–PL08。依赖现有Plugin SDK、统一渠道和Desktop日志writer；无业务数据迁移。

2026-09-14实施验收：AC1–AC4由PL01–PL08的自动化与macOS实际包检查覆盖；Windows与真实平台网络权限需按testing.md人工步骤验证。诊断增强不承诺消除网络、鉴权或模型服务本身的失败。
