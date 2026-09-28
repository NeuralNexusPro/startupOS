# OriginOS CE v0.1.29 Changelog

发布日期：2026-07-25

## 修复

- 关闭 electron-builder 内置 `mac.notarize`，避免 `@electron/notarize` 在 GitHub macOS runner 上吞掉 `notarytool` 空输出错误。
- 新增 `notarize-mac-app.js` afterSign hook：签名后压缩 `.app`，手动提交 Apple notarization，状态为 `Accepted` 后执行 `xcrun stapler staple`。
- API Key notarization 支持 issuer 空输出重试：如果带 `APPLE_API_ISSUER` 时 `notarytool` 返回空输出，会自动尝试不带 issuer 的 Individual API Key 兼容路径。

## 验证

- `node --check packages/desktop/scripts/notarize-mac-app.js`
- `node --check packages/desktop/scripts/run-electron-builder-mac.js`
- `git diff --check`
