# OriginOS CE v0.1.31 Changelog

发布日期：2026-07-25

## 修复

- macOS notarization 改为两阶段：`notarytool submit` 只提交并返回 submission id，随后用 `notarytool info` 轮询状态。
- 为 `submit`、`info`、`log` 和 `stapler` 子进程加入超时，避免 GitHub Actions 在 Apple 服务无响应时长时间无输出等待。
- 轮询期间每 30 秒输出当前 submission 状态，便于判断是 Apple 队列等待还是认证/包校验失败。

## 验证

- `node --check packages/desktop/scripts/notarize-mac-app.js`
- `node --check packages/desktop/scripts/run-electron-builder-mac.js`
- `git diff --check`
