# OriginOS CE v0.1.25 Changelog

发布日期：2026-07-25

## 修复

- 修复 macOS notarization 仍在 notarytool 阶段报 `invalidAsn1` 的问题。
- Apple API key 预处理脚本现在会把可解析的 EC 私钥统一重新导出为 PKCS#8 PEM，即 `-----BEGIN PRIVATE KEY-----` 格式，再写入临时 `.p8` 文件。
- 预处理脚本会校验 `APPLE_API_KEY` 必须是 EC private key；如果 secret 不是 App Store Connect API key 类型，会在构建前失败并给出明确错误。

## 验证

- 使用临时生成的 EC 私钥验证 PKCS#8 raw PEM、escaped PEM、base64 PEM、传统 SEC1 `EC PRIVATE KEY` 都会输出 PKCS#8 `.p8`。
- `node --check packages/desktop/scripts/prepare-apple-api-key.js`
- `git diff --check`
