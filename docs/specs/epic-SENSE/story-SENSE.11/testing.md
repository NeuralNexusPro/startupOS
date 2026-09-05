# SENSE.11 测试

自动化验证 Goal：通过 Story SENSE.11 定义的企业微信智能机器人配置、安全密钥引用、长连接和运行装载测试 case。

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| S11-UT-01 | Core | 合法/非法 WeCom profile | 规范化合法值；拒绝空 Receive ID、非法环境前缀和凭据字段 |
| S11-SEC-01 | Core/Web | 从环境 provider 解析密钥 | 只通过 secretRef 解析，缺失返回安全错误，配置/响应无明文 |
| S11-SEC-02 | Desktop/Web | 感知中心填写 Bot Secret | Secret 仅经 IPC 进入 safeStorage，页面不回显且 Connector JSON 仅保存 secretRef |
| S11-IT-01 | Desktop | 已启用配置启动 supervisor | 使用 Bot ID/Secret 建立 SDK WebSocket 连接 |
| S11-IT-02 | Desktop | 文本/语音消息帧 | 归一化、幂等持久化并进入规则路由 |
| S11-FAIL-01 | Web | 停用、未知、缺失环境密钥 | 路由前拒绝，稳定错误码，不泄密 |
| S11-FAIL-02 | Web | 畸形/超限 XML | 400/413，不写 inbox/event |
| S11-UI-01 | Web | 选择企微并填写配置 | 显示准确回调路径、环境变量名，保存为停用状态 |
| S11-UI-02 | Web | Token/AESKey 防泄漏 | 表单无密钥输入；管理请求仅含引用与非敏感 profile |
| S11-COMPAT-01 | Web | JSON 加密信封 | 继续被现有调用方接受 |

执行 Core/Web Vitest、相关 TypeScript 检查、`pnpm lint` 和 `git diff --check`。真实企微后台 URL 验证及消息回调因需公网地址和企业凭据，记录为人工验收。

## 验收门禁

自动化成功、失败、边界、安全和 UI 用例通过；仓库/运行数据中不存在测试密钥 marker；人工验收记录脱敏证据与公网暴露风险。

## 2026-09-04 验证记录

- Core：企微 provisioning 与既有 Connector 协议共 11 项测试通过。
- Web：配置表单与 Webhook Route 共 18 项测试通过。
- Core、Web TypeScript 检查通过；项目 Web lint 为 0 error（保留仓库既有 warning）；`git diff --check` 通过。
- 自动化覆盖 JSON/XML 信封、畸形 XML、超限请求、密钥引用与 UI 防泄漏。真实企业微信后台验证需要公网 HTTPS 回调域名和企业凭据，本环境未执行；人工验收时需设置环境变量、重启服务、启用连接并完成后台“保存”验证。
