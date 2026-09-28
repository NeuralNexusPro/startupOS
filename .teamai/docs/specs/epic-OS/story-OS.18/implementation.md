# 开发文档 - Story OS.18

**Story:** Windows 内置模板技能加载修复
**版本:** 1.0
**最后更新:** 2026-07-25

---

## 开发目标

让 Windows packaged build 在首次点击内置模板技能时，先从 `templates/skills/{skill}` materialize 到 `data/skills/{skill}`，再从 data 目录稳定加载和运行 `skill-creator-app`。

---

## 文件级改动范围

### 必查

- `packages/web/src/config/homeApps.ts`
- `packages/core/src/lib/integrations/pi-agent/core/skills.ts`
- `packages/core/src/lib/features/skills/**`（如 SkillService 位于此处）
- `packages/core/src/lib/paths.ts`
- `packages/desktop/src/main/services/**`
- `packages/desktop/electron-builder.yml`
- `packages/desktop/scripts/prepare-web-standalone.js`
- `packages/desktop/scripts/verify-windows-package.js`

### 禁止作为修复入口

- `packages/desktop/dist-electron/**`
- `packages/web/.next/**`
- `packages/*/node_modules/**`
- 用户 `data/skills/**` 中不带 `originos-system: true` 的自定义技能

---

## 实施步骤

### 步骤 1: 复现和定位 source roots

- 在 Windows 发布版或等价 `win-unpacked` 环境打开 `skill-creator-app`。
- 打印 SkillService 查询的 source roots。
- 确认 `skill-creator-app` 在 package resources 中实际位置。
- 确认首次点击前用户 `data/skills` 中不存在模板副本，点击后生成带系统标识的 materialized 副本。

### 步骤 2: 对齐首页配置和技能目录名

- 检查 `homeApps.ts` 中 skillName/id 是否为 `skill-creator-app`。
- 检查 bundled/template skills 目录是否存在同名目录和 `SKILL.md`。
- 若存在命名别名，增加显式 alias 映射，并覆盖测试。

### 步骤 3: 建立 bundled/template skill root resolver

- 在 core 或 desktop 适配边界实现 packaged-safe path resolver。
- 对 Windows 路径使用 `path.resolve`、`path.join` 和 slash normalization。
- 不依赖 `process.cwd()` 作为打包态唯一根。

### 步骤 4: SkillService materialize bundled/template source

- 保留 project/user source 逻辑。
- 内置技能未命中 data 目录时查 bundled/template source，并复制到 `data/skills/{skill}`。
- 成功返回技能内容时返回 materialized data 目录作为 `baseDir`/`workingDir`。
- 未命中时返回包含 searched roots 的错误。

### 步骤 5: 打包资源声明

- 确认 electron-builder files/extraResources 包含模板技能目录。
- 如资源当前只在 `.agents/skills` 或 `templates/skills`，选择一个 canonical bundled source 并打包。
- 模板目录只作为安装包内初始化源，运行时按需复制到 `data/skills/{skill}`。

### 步骤 6: 验证脚本加固

- `verify-windows-package.js` 增加对 `skill-creator-app/SKILL.md` 的资源检查。
- 增加一个 Node smoke：模拟 packaged resources root，调用 SkillService 读取 `skill-creator-app` 内容，并确认 materialized data 目录存在且带系统标识。
- 若直接调用 SkillService 需要 Electron 上下文，可新增纯函数 path resolver 单元测试。

### 步骤 7: 本地 Windows 包验证

- 在本地构建 Windows 包，至少生成 `release/win-unpacked`，推荐同时生成 NSIS exe。
- 使用本地包启动应用，不能只验证源码开发态。
- 使用干净或临时用户数据目录启动，确认点击后会生成 `data/skills/skill-creator-app/SKILL.md`。
- 确认该 `SKILL.md` 包含 `originos-system: true`，且自定义技能区域不显示该内置技能。
- 点击首页 `skill-creator-app` 并确认 SkillDialog 能读取内置技能内容。
- 检查运行日志中没有 `SkillServiceError: Skill "skill-creator-app" not found`。

### 步骤 8: 发布验证

- 本地 Windows package 验证通过。
- GitHub Actions Windows build 和 publish 通过。
- CDN 下载 Windows 包安装后，首次打开 `skill-creator-app` 不报 not found。

---

## 兼容策略

- 不迁移或删除用户现有 `data/skills`。
- 若用户已有同名 skill 且不带系统标识，不覆盖该目录。
- 升级安装后不在启动时全量生成模板技能副本；只在用户点击内置技能时按需 materialize。

---

## 审查要点

- 是否有任何路径仍从只读 `templates/skills` 作为运行目录。
- 是否只有点击/启动内置技能时才按需 materialize，而不是启动时全量复制。
- 自定义技能区域是否过滤 `originos-system: true`。
- Windows packaged path 是否只在 desktop 适配层处理。
- SkillService 错误日志是否足以定位 searched roots。
- CI package verify 是否能防止后续发布再次缺内置技能。

---

## 实施完成记录

**状态:** ✅ Complete
**完成日期:** 2026-07-24

### 已完成改动

- `packages/core/src/lib/integrations/pi-agent/core/skills.ts` 增加 packaged-safe bundled skill roots，覆盖 Electron packaged `process.resourcesPath/templates/skills`。
- `packages/core/src/lib/integrations/pi-agent/core/skills.ts` 增加 `materializeBundledSkill()`，首次点击/启动前同步模板技能到 `data/skills/{skill}`。
- `packages/core/src/lib/features/user-registry/index.ts` 与 `packages/core/src/lib/integrations/pi-agent/tools/skill-tools.ts` 过滤 `originos-system: true` 系统技能。
- `packages/desktop/scripts/verify-windows-package.js` 增加 `skill-creator-app/SKILL.md` package resource 校验和运行时模块 smoke。
- `packages/desktop/scripts/prepare-pi-ai-runtime-deps.js` 收集 `@mariozechner/pi-ai` 动态 provider 依赖，并在 Windows package 中打入 `@google/genai` 等运行时包。
- `packages/desktop/scripts/build-windows-local.js` 固定本地 Windows 构建为 pnpm 9.15.9 frozen install，与 GitHub Actions Windows job 对齐。
- `packages/desktop/electron-builder.yml` 将 `.packaging/pi-ai-runtime/node_modules` 作为 package files 输入。

### 兼容性结论

- 模板技能作为只读 bundled/template 初始化源；内置技能运行统一使用 materialized `data/skills/{skill}`。
- 用户/project/bundled 多源加载优先级保持既有语义，不带系统标识的用户同名技能不会被内置模板覆盖。
- Windows 本地包和 CI 包使用同一 package verification，防止后续再次出现 bundled skill 或 provider 依赖缺失。
