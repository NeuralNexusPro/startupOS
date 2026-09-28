# Story OS.18: Windows 内置模板技能加载修复

**Epic:** OS - Phase 0 OS 交互基础
**Status:** ✅ Complete
**Owner:** Product / Engineering
**Created:** 2026-07-23
**Last Updated:** 2026-07-25

---

## Story 概览

### User Story

作为 Windows 桌面版 OriginOS 用户，
我希望首页内置模板技能首次点击时能从安装包模板同步到 `data/skills/{skill}` 并立即从该目录运行，
以便第一次和后续打开的技能工作区、记忆、附件与产物保持一致，同时不会在自定义技能区域显示系统内置技能。

### 背景与问题

- 当前 Windows 版本日志出现：
  `SkillServiceError: Skill "skill-creator-app" not found`
- 近期调整已停止把模板技能复制到用户 `/data/skills`，但这导致首次点击读取 template、运行写 data、工作空间入口打开 data 时出现目录分裂。
- 内置模板技能需要在首次点击时按需 materialize 到 `data/skills/{skill}`，并通过 `SKILL.md` frontmatter 的系统标识从用户自定义技能区域过滤。
- 问题集中在 Windows 打包版本，必须覆盖 Electron packaged 路径、asar/resources 路径和技能多源解析顺序。

### 验收标准（简要）

- [x] AC1: Windows packaged build 中点击 `skill-creator-app` 能成功加载技能内容，不再报 not found。
- [x] AC2: 首次点击内置技能会把模板同步到 `data/skills/{skill}`，本次运行即使用同步后的目录。
- [x] AC3: `SKILL.md` frontmatter 使用 `originos-system: true` 标识系统技能，自定义技能区域不显示这些目录。
- [x] AC4: 用户 `data/skills` 中同名技能如存在，应按既定优先级处理，不能被模板源静默覆盖。
- [x] AC5: 自动化或脚本化验收覆盖 Windows 打包资源、技能内容 API/IPC、用户目录不污染。
- [x] AC6: 本地必须构建出 Windows 安装包或 `win-unpacked`，并完成安装/启动级验证后才能关闭 Story。

---

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)
- [返回 Epic OS](../README.md)

---

## 进度跟踪

- [x] Story 文档创建
- [x] 问题复现与路径定位
- [x] 实施
- [x] 本地 Windows 包构建与启动验证
- [x] 发布链路验证

---

## 后续 Bugfix TODO

- [x] Windows 自动更新失败：用户侧更新时报 `sha512 checksum mismatch`。
  - 现象：自动更新下载到的 Windows 安装包或 blockmap 与 `latest.yml` / `stable.yml` 中记录的 `sha512` 不一致。
  - 修复：GitHub Actions Windows job 在上传 artifact 前重写并校验 update metadata，Windows `latest/stable` metadata 统一指向 NSIS `.exe`；七牛发布脚本上传后刷新 CDN，并用远端内容重新计算 `sha512` 与本地 metadata 对比。
  - 验收要求：发布后必须逐个校验 metadata 中 URL 可访问，并计算远端资源 `sha512` 与 metadata 完全一致；Windows 客户端自动更新不再出现 checksum mismatch。
- [x] Windows 0.1.18 官网下载后仍找不到内置 skill。
  - 现象：线上资源包中存在 `resources/templates/skills/skill-creator-app/SKILL.md`，但安装态点击技能仍报 `Skill "skill-creator-app" not found`，技能工作空间入口打开为空目录。
  - 原因：模板技能不再复制到用户 `data/skills` 后，`SkillLauncher` 仍只取第一个存在的 bundled skill root；安装态若前序候选目录存在但不含目标技能，会提前锁定错误根目录。本地 0.1.17 构建通常只有 repo `templates/skills` 一个有效候选，因此没有触发。
  - 修复：`SkillLauncher` 与 `loadSkills()` 对齐，遍历所有 `getBundledSkillDirs()` 候选；Windows package verifier 增加 runtime 静态检查，确保编译后的 launcher 包含多 bundled root fallback。
- [x] Windows 0.1.19 官网下载后仍找不到内置 skill，且内置技能工作空间入口为空。
  - 现象：`SkillService#getSkillContent` 报 `Skill "skill-creator-app" not found`；即使模板资源存在，首次点击未 materialize 到 `data/skills/{skill}`，工作区与技能源分裂。
  - 修复：内置模板技能首次点击或启动前从 `resources/templates/skills/{skill}` 同步到 `data/skills/{skill}`，本次即从 data 目录读取和运行；模板 `SKILL.md` 增加 `originos-system: true`，用户自定义技能 registry 和 `list_skills` 工具过滤系统技能。

---

## 完成归档

**完成日期:** 2026-07-24
**代码提交:** `b6468e1`, `d6e373b`
**归档提交:** 本次 Story 归档提交

### 实施摘要

- SkillService bundled/template skill resolver 已支持 Windows packaged resources path，内置技能首次点击会 materialize 到用户 `data/skills/{skill}` 并从该目录运行。
- Windows package verification 已覆盖 `templates/skills/skill-creator-app/SKILL.md`，并增加 packaged runtime smoke。
- Windows package verification 已追加 `SkillLauncher` 多 bundled root fallback 检查，避免只校验资源存在但运行时仍选错路径。
- 本地 Windows 构建入口固定为 `pnpm@9.15.9` frozen install，与 GitHub Actions 步骤对齐。
- Windows package 显式打入 `@mariozechner/pi-ai` 动态 provider 运行时依赖，避免 `Cannot find module '@google/genai'`。
- 内置模板技能 `SKILL.md` 使用 `originos-system: true` 标识，materialized 后不进入用户自定义技能区域。

### 验证摘要

- `node packages/desktop/scripts/build-windows-local.js` 通过。
- `pnpm --filter @originos/desktop verify:win-package` 通过。
- 生成并验证 `release/OriginOS CE-0.1.17-x64.exe`、`release/OriginOS CE-0.1.17-x64.zip`。
- `npx pnpm@9.15.9 lint` 通过，存在既有 warning，无 error。

---

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-07-24 | 完成 Story OS.18 实施、Windows 本地包验证与归档 | Codex |
| 2026-07-24 | 修复官网 0.1.18 Windows 安装态内置 skill fallback 失效 | Codex |
| 2026-07-25 | 调整为内置技能按需 materialize 到 data/skills 并按系统标识过滤自定义技能区 | Codex |
| 2026-07-23 | 创建 Windows 内置模板技能加载 bugfix Story | Codex |
