# SENSE.10 需求

## 需求来源

- 用户反馈：当前感知中心只能保存邮箱配置骨架，无法连接真实邮箱。
- Epic SENSE：补齐 Connector Provisioning、Secret Provider、测试连接和常驻 Supervisor。
- 依赖：SENSE.1、SENSE.3、SENSE.7、SENSE.8、SENSE.9。

## 详细需求

1. 邮箱配置包含 connector ID、IMAP host、port、TLS 模式、username、auth mode、mailbox、poll interval；password/app password/OAuth token 为 write-only。
2. 非敏感配置继续写入 `data/perception/connectors/{id}.json` DataFile，凭据由 Desktop `safeStorage` 加密后写入独立 secret store，配置只保存 `secret://perception/mail/{id}`。
3. Next.js API Route、Zustand、日志、审计、错误消息和 Agent prompt 不得出现真实凭据。
4. 测试连接包含 DNS/TCP/TLS/认证/邮箱目录验证，默认 10 秒超时，返回安全错误码。
5. 用户只有在测试成功后才能启用邮箱；修改连接参数或重新绑定凭据后自动 disabled，要求重新测试。
6. Desktop Supervisor 启动时加载 enabled Email Connector，按配置周期轮询；进程恢复时从 UIDVALIDITY/UID 游标继续。
7. 每次轮询调用既有 EmailPoller，生成 PerceptionEvent 后进入规则、授权、lease 和 route 链路。
8. 首次启用且不存在持久游标时，以邮箱当前 `UIDNEXT - 1` 建立基线，不把历史邮件生成感知事件；后续只处理基线之后的新 UID。

## Given / When / Then

### AC1：安全保存

**Given** 用户填写合法 IMAP 参数和应用授权码  
**When** 点击“保存并测试”  
**Then** Desktop IPC 将凭据写入 safeStorage，DataFile 只包含 secretRef，UI/API 不回显授权码。

### AC2：连接成功

**Given** TLS、账号、凭据和 INBOX 均有效  
**When** 执行测试连接  
**Then** 10 秒内返回 success、服务器 capability 摘要和安全时间戳，不启动轮询。

### AC3：连接失败

**Given** 密码错误、证书无效、超时或邮箱目录不存在  
**When** 执行测试连接  
**Then** 返回 `AUTH_FAILED`、`TLS_FAILED`、`TIMEOUT` 或 `MAILBOX_NOT_FOUND`，不记录原始异常和凭据。

### AC4：增量轮询

**Given** Connector 已测试并启用，游标 lastUid=9  
**When** 邮箱出现 UID 10–12  
**Then** 只处理 10–12，全部持久化成功后推进游标；重启不重复触发执行。

### AC5：环境边界

**Given** 用户在普通浏览器而非 Electron 中打开感知中心  
**When** 尝试绑定邮箱凭据  
**Then** UI 禁止提交并说明需使用桌面版，不调用保存凭据 API。

### AC6：首次增量基线

**Given** Connector 首次启用、邮箱已有历史邮件且尚无 cursor  
**When** 首次轮询读取邮箱当前 UIDNEXT  
**Then** 将 `UIDNEXT - 1` 持久化为 lastUid，不生成历史事件；下一封新邮件在后续轮询中被处理。

## 边界与异常

- Port 1–65535；poll interval 15–3600 秒；host、username、mailbox 长度有界。
- 首版支持 IMAP password/app password；OAuth2 token 复用 write-only contract，但不实现 OAuth 授权跳转。
- UIDVALIDITY 变化时重建游标并以 source dedupe 防止重复执行。
- safeStorage 不可用时 fail closed，绝不写入明文替代文件。
- 多邮箱独立健康、退避和停用；一个邮箱认证失败不阻塞其他来源。

## 非功能需求

- 测试连接默认超时 10 秒；UI 初始响应 <500ms。
- Core 逻辑单元测试 ≥80%，Desktop IPC/secret/test/supervisor 集成点 100%。
- 遵循 Desktop→Core、Web→Core 单向依赖，无数据库，无 app route 业务逻辑。
