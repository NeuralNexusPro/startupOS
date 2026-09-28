# OriginOS CE v0.1.32 Changelog

发布日期：2026-07-25

## 修复

- macOS CI 预装 `rcodesign` 作为 Apple notarization fallback。
- 当 `xcrun notarytool submit` 在 GitHub macOS runner 上以 `SIGTRAP` 或 `SIGILL` 崩溃时，自动切换到 `rcodesign notary-submit --staple`。
- 保留 notarytool 的正常错误路径；只有 CLI 崩溃且无 Apple 服务响应时才 fallback。

## 验证

- `node --check packages/desktop/scripts/notarize-mac-app.js`
- `node --check packages/desktop/scripts/run-electron-builder-mac.js`
- `git diff --check`
