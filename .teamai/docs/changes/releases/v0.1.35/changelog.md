# OriginOS CE v0.1.35 Changelog

发布日期：2026-07-25

## 修复

- 重新触发桌面发布链路，验证已更新的 GitHub Actions Apple notarization secrets。
- 保留 `.p8` 私钥 ignore 规则，避免 `AuthKey_*.p8` 被误提交。

## 验证

- `git diff --check`
