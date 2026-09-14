# SENSE.11 实施

## 实施步骤

1. 增加 WeCom profile、secret provider 和激活校验。
2. 扩展 Connector Store 的企微启用门禁。
3. 增加 Webhook 配置自动装载与 XML 信封解析。
4. 将感知中心企微表单改为 Receive ID + 环境密钥引用 + 回调路径交互。
5. 补齐 Core/Web 单元与集成测试，执行类型检查和 lint。

## 文件级范围

仅修改 `packages/core` 的企微公共 API/配置校验、`packages/web` 的服务/API/UI/测试，以及本 Story 文档和 Epic 索引；不修改编译产物。

## 兼容策略

Webhook POST 保留 JSON 信封支持；现有由代码显式注册的 Connector 继续可用。旧企微配置缺少 profile 时不能启用，并通过 UI 重新保存迁移。

## 审查要点

- 搜索产物确认无测试 Token/AESKey 明文。
- 验证管理 API 不返回 `secretRef` 或环境值。
- 验证 XML 解析无通用 XML 实体能力。
- 验证 API Route 只做协议边界映射。
