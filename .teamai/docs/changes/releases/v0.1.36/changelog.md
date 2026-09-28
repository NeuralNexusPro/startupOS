# OriginOS CE v0.1.36 Changelog

发布日期：2026-07-25

## 修复

- macOS release 没有 zip 产物时，基于 x64/arm64 dmg 生成 `latest-mac.yml` 和 `stable-mac.yml`。
- Qiniu 发布脚本会在 macOS dmg 齐全时上传 mac metadata。
- `verify:update-metadata` 增加 mac metadata 校验，防止 CDN 上 mac metadata 停留在旧版本。

## 验证

- `node --check packages/desktop/scripts/generate-update-metadata.js`
- `node --check packages/desktop/scripts/publish-qiniu-updates.js`
- `node --check packages/desktop/scripts/verify-update-metadata.js`
- `git diff --check`
