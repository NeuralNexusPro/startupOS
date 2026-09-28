# OriginOS CE v0.1.21 Changelog

## 2026-07-24 — fix：修复 Windows 构建 verifier unpacked runtime 读取

**类型**：fix
**影响模块**：`packages/desktop/scripts/verify-windows-package.js`
**摘要**：修复 Windows `verify:win-package` 在检查 `SkillLauncher` runtime 时只从 `app.asar` 读取，未兼容 `app.asar.unpacked` 条目，导致 GitHub Actions 抛 `"dist-electron/core/src/lib/features/services/launcher/skill.js" was not found in this archive` 的问题。

## 同步包含

- Windows 安装态内置 skill bundled fallback 修复。
- 角色窗体附件按钮修复。
- Windows 自动更新 metadata sha512 校验修复。

## 验证

- `node --check packages/desktop/scripts/verify-windows-package.js`
