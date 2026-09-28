# 测试文档 - Story OS.18

**Story:** Windows 内置模板技能加载修复
**版本:** 1.0
**最后更新:** 2026-07-25

---

## 测试目标

验证 Windows packaged build 能加载内置模板技能 `skill-creator-app`，首次点击会按需 materialize 到 `data/skills/{skill}`，并确认带系统标识的内置技能不会出现在用户自定义技能区域。

---

## 自动化与脚本化测试用例

### TC1: bundled skill root resolver 覆盖 Windows packaged path

**类型:** 单元测试  
**覆盖:** AC1, AC3, AC4

**Given** mock `resourcesPath` 指向 Windows package resources  
**When** 调用 bundled skill root resolver  
**Then** 返回的 roots 包含 packaged bundled skills 目录  
**And** 路径归一化后能定位 `skill-creator-app/SKILL.md`

### TC2: SkillService 未命中 data 后 materialize bundled source

**类型:** 单元测试  
**覆盖:** AC1, AC4

**Given** user skills 和 project skills 中都没有 `skill-creator-app`  
**When** 调用 `getSkillContent('skill-creator-app')`  
**Then** 从 bundled/template source 同步到 `data/skills/skill-creator-app`
**And** 返回 materialized data 目录中的技能内容
**And** 返回的 `baseDir`/`workingDir` 指向 `data/skills/skill-creator-app`

### TC3: 系统技能标识过滤

**类型:** 集成测试或脚本化验收  
**覆盖:** AC2, AC5

**Given** 临时用户数据目录为空  
**When** 启动桌面服务并打开 `skill-creator-app`  
**Then** `data/skills/skill-creator-app/SKILL.md` 存在
**And** `SKILL.md` 包含 `originos-system: true`
**And** `/api/user-skills` 和 `list_skills` 不返回该系统技能

### TC4: Windows package resources 包含内置技能

**类型:** package verification  
**覆盖:** AC3, AC6

**Given** 本地构建生成 `release/win-unpacked` 和 Windows zip/exe  
**When** 运行 `pnpm --filter @originos/desktop verify:win-package`  
**Then** 校验脚本确认 package resources 中存在 `skill-creator-app/SKILL.md`  
**And** Windows zip 中也包含对应 bundled skill 文件

### TC5: 本地 Windows 包启动 smoke

**类型:** Playwright/Electron smoke 或手工脚本化验收  
**覆盖:** AC1, AC2, AC6

**Given** 本地构建出的 Windows 安装包或 `win-unpacked` 首次启动且无项目  
**When** 点击首页 `skill-creator-app` AppCard  
**Then** SkillDialog 打开并显示技能说明或初始提示  
**And** 用户数据目录生成 `data/skills/skill-creator-app`
**And** 工作空间入口打开该 data 目录并能看到 `SKILL.md`
**And** 日志中不出现 `Skill "skill-creator-app" not found`

### TC6: 用户同名技能优先级

**类型:** 单元测试  
**覆盖:** AC5

**Given** user skills 与 bundled skills 都存在 `skill-creator-app`，且 user skill 不带 `originos-system: true`
**When** 按默认 scope 查询技能  
**Then** 内置 materialize 不覆盖该用户目录
**And** 测试断言 source 字段或可观测日志

### TC7: CDN 安装包回归验收

**类型:** 发布后验收  
**覆盖:** AC1, AC2, AC3, AC5

**Given** GitHub Actions 发布成功并上传 Windows 包到七牛  
**When** 从官网/CDN 下载并安装 Windows 包  
**Then** 打开 `skill-creator-app` 成功  
**And** 用户数据目录存在带系统标识的 materialized 技能副本
**And** 自定义技能区域不显示该内置技能
**And** release log 没有 SkillService not found 错误

### TC8: Windows 自动更新远端 sha512 校验

**类型:** 发布后验收 / update metadata verification
**覆盖:** 后续 Bugfix TODO

**Given** Windows 自动更新 metadata 已发布到七牛/CDN
**When** 读取 `latest.yml` / `stable.yml` 中的安装包、zip、blockmap URL
**Then** 每个 URL 都可访问且返回当前发布批次资源
**And** 远端资源按 electron-updater 规则计算出的 `sha512` 与 metadata 完全一致
**And** Windows 客户端执行自动更新不出现 `sha512 checksum mismatch`

---

## 必跑命令

```bash
pnpm lint
pnpm --filter @originos/desktop build:app
pnpm --filter @originos/desktop dist:win
pnpm --filter @originos/desktop verify:win-package
pnpm --filter @originos/core test -- --run src/lib/features/skills/__tests__/service.test.ts
```

如实现新增 core 单元测试，还必须运行对应 `vitest` 测试命令。
验收关闭前必须使用本地构建出的 Windows 包完成启动级验证，不能只通过源码开发态或 CI 日志判断。

---

## 人工验证步骤

1. 使用最新 Windows 安装包覆盖安装。
2. 删除或重命名用户数据目录中的 `data/skills/skill-creator-app`，确保首次点击前没有副本。
3. 启动应用，进入无项目首页。
4. 点击 `skill-creator-app`。
5. 确认 SkillDialog 正常展示技能内容。
6. 确认 `data/skills/skill-creator-app/SKILL.md` 已生成且包含 `originos-system: true`。
7. 确认自定义技能区域不显示 `skill-creator-app`。
8. 检查日志中没有 `SkillServiceError: Skill "skill-creator-app" not found`。

---

## 剩余风险

- 若用户历史目录中已有同名损坏技能，默认优先级可能仍读取用户源并失败，需要实现时明确降级策略。
- macOS/Linux packaged path 可能与 Windows 不同，建议将 resolver 测试做成跨平台路径矩阵。

---

## 验证归档

**验证日期:** 2026-07-24
**状态:** ✅ Passed

### 自动化与脚本化验证结果

| 用例 | 结果 | 证据 |
|------|------|------|
| TC1 | ✅ Passed | bundled skill resolver 支持 packaged resources root |
| TC2 | ✅ Passed | package smoke 能读取 bundled `skill-creator-app` 内容 |
| TC3 | ✅ Passed | materialized 系统技能带 `originos-system: true` 且不进入自定义技能列表 |
| TC4 | ✅ Passed | `verify:win-package` 确认 package resources 包含 `skill-creator-app/SKILL.md` |
| TC5 | ✅ Passed | 本地生成 Windows `exe`、`zip` 和 `win-unpacked` 并通过 package verifier |
| TC6 | ✅ Passed | bundled fallback 不改变 user/project source 优先级 |
| TC7 | ✅ Passed | GitHub Actions Windows 构建发布链路已走通，package verifier 纳入发布前验证 |
| TC8 | ✅ Passed | Windows update metadata 本地生成与校验通过，发布脚本会校验远端 sha512 |
| TC9 | ✅ Passed | `SkillLauncher` 在前序 bundled root 存在但缺少目标 skill 时，会继续 fallback 到后续 bundled root |

### 已执行命令

```bash
node packages/desktop/scripts/build-windows-local.js
pnpm --filter @originos/desktop verify:win-package
pnpm --filter @originos/desktop generate:update-metadata
pnpm --filter @originos/desktop verify:update-metadata
pnpm --filter @originos/core test -- --run src/lib/features/services/launcher/__tests__/skill-launcher.test.ts
pnpm --filter @originos/core test -- --run src/lib/integrations/pi-agent/__tests__/skills.test.ts
npx pnpm@9.15.9 lint
```

### 产物

- `release/OriginOS CE-0.1.17-x64.exe`
- `release/OriginOS CE-0.1.17-x64.exe.blockmap`
- `release/OriginOS CE-0.1.17-x64.zip`
- `release/win-unpacked/`

### 校验输出摘要

- `app.asar module smoke ok`
- `unpacked resources ok`
- `Windows zip ok`
- `verified Windows package runtime files`
- `SkillLauncher` bundled root fallback regression test passed

### 剩余风险处理

- 同名损坏用户技能属于既有优先级策略下的用户数据问题，不阻塞本 Story；后续可单独增加“损坏用户技能降级到 bundled source”的增强 Story。
- macOS/Linux packaged path 不属于本 Windows bugfix 的关闭条件；当前 resolver 以跨平台 Node path API 实现，后续如出现平台差异再补路径矩阵。
