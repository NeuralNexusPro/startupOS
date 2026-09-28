# OriginOS CE v0.1.38 Changelog

发布日期：2026-07-25

## 修复

- Qiniu publish job 下载 Windows/macOS artifacts 后先生成全平台更新元数据。
- `verify:release-artifacts` 现在能在发布前同时校验 Windows 和 macOS metadata。

## 验证

- `git diff --check`
