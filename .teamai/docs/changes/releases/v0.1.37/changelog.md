# OriginOS CE v0.1.37 Changelog

发布日期：2026-07-25

## 修复

- `verify:update-metadata` 不再把 Windows `OriginOS CE-*-x64.zip` 误判为 macOS zip。
- mac metadata 校验现在要求 macOS x64/arm64 zip 同时存在，或 x64/arm64 dmg 同时存在。

## 验证

- `node --check packages/desktop/scripts/verify-update-metadata.js`
- `git diff --check`
