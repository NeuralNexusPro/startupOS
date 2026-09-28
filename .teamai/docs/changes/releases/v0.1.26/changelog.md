# OriginOS CE v0.1.26 Changelog

发布日期：2026-07-25

## 修复

- 在 macOS Actions 的 electron-builder 构建前新增 `xcrun notarytool history` 凭据验证步骤。
- 该步骤会直接使用规范化后的 `.p8` 文件、`APPLE_API_KEY_ID` 和 `APPLE_API_ISSUER` 验证 Apple notarization 凭据，便于区分“Apple 凭据本身无效”和“electron-builder 传参/公证流程失败”。

## 验证

- `git diff --check`
