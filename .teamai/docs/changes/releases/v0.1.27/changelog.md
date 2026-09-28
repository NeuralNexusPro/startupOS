# OriginOS CE v0.1.27 Changelog

发布日期：2026-07-25

## 修复

- 移除 macOS Actions 中不可靠的 `xcrun notarytool history` 预检步骤。该命令在 GitHub macOS runner 上会以 `Trace/BPT trap` / exit code 133 崩溃，无法作为有效凭据验证。
- 保留 `prepare-apple-api-key.js` 对 Apple API key 的 PKCS#8 规范化，让 electron-builder/notarytool 直接执行正式 notarization。

## 验证

- `git diff --check`
