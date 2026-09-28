# OriginOS CE v0.1.24 Changelog

发布日期：2026-07-25

## 修复

- 修复 macOS GitHub Actions notarization 阶段 `notarytool` 报 `invalidAsn1` 时诊断不清晰的问题。
- 新增 Apple API key 预处理脚本，支持 `APPLE_API_KEY` secret 使用原始 PEM、带 `\n` 转义的 PEM、或 PEM 的 base64 三种格式。
- 在 electron-builder 运行前使用 Node `crypto.createPrivateKey()` 校验 `.p8` 私钥格式，格式错误会在 “Verify macOS signing secrets” 阶段提前失败并给出明确提示。

## 验证

- `node --check packages/desktop/scripts/prepare-apple-api-key.js`
- 使用临时生成的 PKCS#8 私钥验证 raw PEM、escaped PEM、base64 PEM 三种输入均能生成有效 `.p8` 文件。
