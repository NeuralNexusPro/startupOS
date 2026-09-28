# OriginOS CE v0.1.34 Changelog

发布日期：2026-07-25

## 修复

- Apple notarization 凭据预检失败时输出 GitHub Actions error annotation。
- 公开 Actions API 现在可以直接看到预检失败原因，避免只能看到 `Process completed with exit code 1`。

## 验证

- `node --check packages/desktop/scripts/verify-apple-notary-credentials.js`
- `git diff --check`
