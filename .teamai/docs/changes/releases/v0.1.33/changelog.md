# OriginOS CE v0.1.33 Changelog

发布日期：2026-07-25

## 修复

- macOS release job 在 `build:app` 前执行 App Store Connect Notary API 凭据预检。
- 新增 `verify-apple-notary-credentials.js`，使用 `rcodesign notary-list` 验证当前 `APPLE_API_ISSUER`、`APPLE_API_KEY_ID`、`APPLE_API_KEY` 是否能通过 Apple 认证。
- 当 API key 不匹配或无权限时，Actions 会在凭据验证阶段直接失败，并提示检查三项 secret 是否来自同一个 App Store Connect API key。

## 验证

- `node --check packages/desktop/scripts/verify-apple-notary-credentials.js`
- `node --check packages/desktop/scripts/notarize-mac-app.js`
- `node --check packages/desktop/scripts/run-electron-builder-mac.js`
- `git diff --check`
