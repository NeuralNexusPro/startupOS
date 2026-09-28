# OriginOS CE v0.1.23 Changelog

发布日期：2026-07-25

## 修复

- 修复 Windows 已存在 `data/skills/{skill}/SKILL.md` 但技能内容接口仍返回 404 的问题。根因是 Windows 用户目录中的 `SKILL.md` 使用 CRLF 换行，旧 frontmatter parser 只匹配 LF，导致技能元数据解析为空并被跳过。
- 技能加载器现在兼容 CRLF frontmatter，并支持大小写不敏感识别 `SKILL.md`。
- 技能内容接口会先按请求目录名读取 `data/skills/{skill}`，再走索引查找和模板物化，避免已有运行态技能因索引未命中而无法打开。
- macOS GitHub Actions 发布重新启用 notarization，并将 `APPLE_API_KEY` secret 写入临时 `.p8` 文件供 `notarytool` 使用。
- macOS 签名验证增加 Gatekeeper `spctl --assess` 检查，未通过公证的包不会进入发布。

## 验证

- `pnpm --filter @originos/core exec vitest run src/lib/features/skills/__tests__/service.test.ts src/lib/integrations/pi-agent/__tests__/skills.test.ts`
- `pnpm --filter @originos/desktop build`
- 使用 `/mnt/c/Users/admin/AppData/Roaming/@originos/desktop/data/skills/role-agent-creator/SKILL.md` 验证编译后 loader 可解析 CRLF frontmatter 并命中用户数据目录。
- `node --check packages/desktop/scripts/verify-mac-signing.js`
- `node --check packages/desktop/scripts/verify-mac-package.js`
- `node --check packages/desktop/scripts/verify-windows-package.js`
