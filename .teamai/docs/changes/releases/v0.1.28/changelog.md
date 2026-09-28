# OriginOS CE v0.1.28 Changelog

发布日期：2026-07-25

## 修复

- macOS Actions 改为通过 `run-electron-builder-mac.js` 调用 electron-builder。
- 当 macOS 打包或 notarization 失败时，CI 会把最后 80 行 electron-builder 日志写入 GitHub annotation，便于在无法读取完整 job log 的情况下继续定位失败原因。

## 验证

- `node packages/desktop/scripts/run-electron-builder-mac.js`
- `git diff --check`
