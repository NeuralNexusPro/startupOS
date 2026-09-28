# OriginOS CE v0.1.39 Changelog

发布日期：2026-07-25

## 修复

- macOS release artifacts 上传 zip 和 zip.blockmap。
- `latest-mac.yml` / `stable-mac.yml` 重新以 macOS zip 作为更新包，不再指向 dmg。
- 发布脚本要求 macOS x64/arm64 zip 成对存在后才生成 mac 更新元数据，修复自动更新 `zip file not provided`。

## 验证

- `node --check packages/desktop/scripts/generate-update-metadata.js`
- `node --check packages/desktop/scripts/publish-qiniu-updates.js`
- `node --check packages/desktop/scripts/verify-update-metadata.js`
- `git diff --check`
