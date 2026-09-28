# OriginOS CE v0.1.30 Changelog

发布日期：2026-07-25

## 修复

- 保留 `APPLE_API_ISSUER` 参与 Apple API Key notarization。0.1.29 证明当前 key 不能走无 issuer 路径，Apple 会返回 `Must provide all App Store Connect API arguments`。
- 兼容 GitHub macOS runner 上 `notarytool submit --wait --output-format json` exit code 0 但 stdout 为空的情况：继续执行 `xcrun stapler staple`，由 stapler 作为最终 notarization 验收。

## 验证

- `node --check packages/desktop/scripts/notarize-mac-app.js`
- `node --check packages/desktop/scripts/run-electron-builder-mac.js`
- `git diff --check`
