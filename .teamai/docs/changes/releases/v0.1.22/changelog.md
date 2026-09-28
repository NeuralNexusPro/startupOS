# OriginOS CE v0.1.22 Changelog

## 2026-07-25 — fix：内置技能按需同步到 data 后运行

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/skills.ts`, `packages/core/src/lib/features/skills/service.ts`, `packages/core/src/lib/features/services/launcher/skill.ts`, `templates/skills/*/SKILL.md`
**摘要**：内置模板技能首次点击或启动前会从 `resources/templates/skills/{skill}` 同步到 `data/skills/{skill}`，本次 SkillDialog 和 Agent 启动即使用 data 目录，保证第一次与后续运行的记忆、附件、工作空间和产物一致。内置模板 `SKILL.md` 增加 `originos-system: true` 元数据，materialized 后不会显示在用户自定义技能区域。

## 2026-07-25 — fix：macOS package runtime 校验 pi-agent-core

**类型**：fix
**影响模块**：`packages/desktop/package.json`, `packages/desktop/electron-builder.yml`, `packages/desktop/scripts/verify-mac-package.js`, `.github/workflows/desktop-release.yml`
**摘要**：Desktop 包显式声明 `@mariozechner/pi-agent-core`，electron-builder 从 desktop package 边界复制运行依赖，并在 macOS arm64/x64 Actions 构建后校验 app.asar 内 `@mariozechner/agent` 与 `@mariozechner/pi-agent-core` 可解析，避免 macOS 安装包启动时报缺少 `pi-agent-core`。

## 验证

- `pnpm install --frozen-lockfile`
- `pnpm --filter @originos/desktop build`
- `pnpm --filter @originos/core exec vitest run src/lib/features/skills/__tests__/service.test.ts`
- `pnpm --filter @originos/core exec vitest run src/lib/features/services/launcher/__tests__/skill-launcher.test.ts`
- `pnpm --filter @originos/core exec vitest run src/lib/integrations/pi-agent/__tests__/skills.test.ts`
- `pnpm --filter @originos/core exec vitest run src/lib/features/user-registry/__tests__/user-registry.test.ts`
- `node --check packages/desktop/scripts/verify-mac-package.js`
- `node --check packages/desktop/scripts/verify-windows-package.js`
- `node packages/desktop/scripts/build-windows-local.js`
- `pnpm --filter @originos/desktop generate:update-metadata`
- `pnpm --filter @originos/desktop verify:update-metadata`
