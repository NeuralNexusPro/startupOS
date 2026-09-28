# OriginOS CE v0.1.18 Changelog

## 2026-07-24 — fix：修复 Windows 自动更新 sha512 mismatch

**类型**：fix
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/generate-update-metadata.js`, `packages/desktop/scripts/verify-update-metadata.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/package.json`
**摘要**：Windows 构建完成后由项目脚本重写 update metadata，确保 `latest-win.yml`、`stable-win.yml`、`latest.yml`、`stable.yml` 都指向 NSIS `.exe` 且 sha512/size 与本地产物一致。GitHub Actions 在上传 Windows artifact 前执行 metadata 校验，七牛发布脚本上传资源后刷新 CDN 并下载远端内容重新计算 sha512，若 CDN 返回旧资源或 metadata 不匹配则发布失败，避免客户端自动更新出现 `sha512 checksum mismatch`。

## 2026-07-24 — fix：Windows 包打入 pi-ai provider 动态依赖

**类型**：fix
**影响模块**：`packages/desktop/scripts/prepare-pi-ai-runtime-deps.js`, `packages/desktop/scripts/build-windows-local.js`, `packages/desktop/scripts/verify-windows-package.js`, `packages/desktop/electron-builder.yml`, `package.json`, `pnpm-lock.yaml`
**摘要**：本地 Windows 构建入口固定为 `pnpm@9.15.9` frozen install，与 GitHub Actions Windows job 对齐；打包前从 `@mariozechner/pi-ai` 实际安装目录收集动态 provider runtime 依赖并写入 package files，修复安装后 `Cannot find module '@google/genai'`。Windows package verifier 现在会实际 resolve/import Google GenAI、Bedrock、Mistral、proxy-agent 等依赖，避免只校验元数据。

## 2026-07-24 — fix：Windows 内置模板技能加载修复

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/skills.ts`, `packages/desktop/scripts/verify-windows-package.js`, `docs/specs/epic-OS/story-OS.18/**`
**摘要**：Windows packaged build 现在能从只读 bundled/template source 加载 `skill-creator-app`，不再依赖用户 `data/skills` 副本。模板技能不会复制到用户技能目录，同时 package verifier 会检查 `templates/skills/skill-creator-app/SKILL.md` 是否存在于最终资源包。

## 2026-07-24 — chore：移除已跟踪桌面构建产物

**类型**：chore
**影响模块**：`.gitignore`, `packages/desktop/.packaging/**`, `packages/desktop/dist-electron/**`
**摘要**：将嵌套 `dist-electron` 和 `.packaging` 构建产物加入忽略规则，并从 Git 索引移除已跟踪的桌面 standalone 与 Electron 编译产物，避免后续本地构建污染工作区。

## 验证

- `pnpm --filter @originos/desktop generate:update-metadata` 通过。
- `pnpm --filter @originos/desktop verify:update-metadata` 通过。
- `pnpm --filter @originos/desktop verify:win-package` 通过。
- GitHub Actions `desktop-release` 将在 `desktop-v0.1.18` tag 推送后构建并发布三平台产物。
