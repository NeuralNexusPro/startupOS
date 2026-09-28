# 需求文档 - Story OS.18

**Story:** Windows 内置模板技能加载修复
**版本:** 1.0
**最后更新:** 2026-07-25

---

## 需求来源

- 用户反馈：Windows 发布版仍报 `SkillServiceError: Skill "skill-creator-app" not found`。
- 用户修正要求：内置模板技能首次点击时应从 `templates/skills` 同步到 `data/skills/{skill}` 后启动，保证第一次与后续运行的记忆、附件、产物和工作空间一致。
- AGENTS.md：技能系统支持 bundled / project / user 多源加载；`data/skills` 是运行时产物目录，内置技能 materialized 后必须通过元数据标识与用户自定义技能区隔离。

---

## 详细需求

### FR1: 内置模板技能必须按需 materialize 后运行

系统内置模板技能首次点击或启动前，应从 packaged resources、app.asar 或明确的 bundled skills 目录复制/同步到 `data/skills/{skillName}`，并让本次 SkillDialog/Agent 启动使用同步后的 data 目录。

**优先级:** High

### FR2: 系统内置技能必须用 SKILL.md 元数据标识

内置模板技能的 `SKILL.md` frontmatter 必须包含系统标识，例如 `originos-system: true`。该标识跟随 materialize 副本进入 `data/skills/{skillName}`。

**优先级:** High

### FR3: Windows packaged 路径必须受支持

SkillService 必须在 Windows packaged 环境正确解析模板技能目录，包括：

- `process.resourcesPath` 下的 packaged resources。
- `app.asar` 内或 `app.asar.unpacked` 旁的 bundled resources。
- 开发态仓库路径和 Electron 打包态路径差异。

**优先级:** High

### FR4: 多源加载优先级必须明确

`user`、`project`、`bundled/template`、`system-managed materialized` 的优先级必须在代码和测试中明确。若用户 `data/skills/{skillName}` 已存在且不是系统标识目录，不得被内置模板静默覆盖。

**优先级:** Medium

### FR5: 自定义技能区域必须过滤系统技能

用户自定义技能区域、`/api/user-skills` 和 Agent 的 `list_skills` 工具不得展示带 `originos-system: true` 的 materialized 内置技能。

**优先级:** Medium

### FR6: 打包校验必须包含内置技能

Windows package verification 应校验 `skill-creator-app` 等首页内置模板技能存在于最终安装包可访问路径，并能读取 `SKILL.md` 或等价内容入口。

**优先级:** High

---

## 验收标准

### AC1: Windows 发布版能打开内置技能

**Given** 用户安装 Windows 0.1.17 或后续修复版本  
**When** 在无项目首页点击 `skill-creator-app`  
**Then** SkillDialog 成功加载技能内容  
**And** 日志中不出现 `SkillServiceError: Skill "skill-creator-app" not found`

### AC2: 首次点击会同步到 data 并从 data 运行

**Given** 用户数据目录不存在 `data/skills/skill-creator-app`  
**When** 启动 Windows 桌面版并打开内置技能  
**Then** 系统从 `resources/templates/skills/skill-creator-app` 同步模板到 `data/skills/skill-creator-app`
**And** 本次 SkillDialog 和 Agent 启动使用 `data/skills/skill-creator-app` 作为 `baseDir`/`workingDir`
**And** 运行结果、记忆、附件和工作空间入口都指向该 data 目录

### AC3: 打包资源包含内置模板技能

**Given** CI 生成 Windows package  
**When** 运行 package verification  
**Then** 校验脚本能在最终 package resources 中找到 `skill-creator-app` 的技能定义文件  
**And** 该路径可被运行时 SkillService 使用

### AC4: 开发态与打包态行为一致

**Given** 开发态 `pnpm --filter @originos/desktop build:app` 和 Windows packaged build  
**When** 查询 `skill-creator-app` 内容  
**Then** 两种环境都能返回同一版本的技能内容  
**And** 首次 materialize 后均从 `data/skills/skill-creator-app` 运行

### AC5: 系统技能不进入自定义技能区

**Given** `data/skills/skill-creator-app/SKILL.md` 包含 `originos-system: true`
**When** 首页自定义技能区域、`/api/user-skills` 或 `list_skills` 工具扫描用户技能
**Then** `skill-creator-app` 不会作为用户自定义技能返回

### AC6: 同名用户技能优先级稳定

**Given** 用户 `data/skills` 中存在同名技能  
**When** SkillService 查询该 skill  
**Then** 若该目录不含系统标识，内置模板不得覆盖该目录
**And** UI 或日志能区分最终来源，便于排查覆盖问题

---

## 边界条件

- Windows 路径分隔符为 `\`，路径归一化必须使用 Node `path` API。
- packaged app 中 `process.cwd()` 不可靠，不能作为 bundled skill 根目录唯一来源。
- `app.asar` 内文件只读，运行时不得向该目录写产物。
- 用户数据目录不存在时必须自动创建会话/产物目录；内置技能首次打开时允许创建带系统标识的 materialized 技能目录。
- CDN 安装包与本地构建包都必须通过同一验证脚本或验收步骤。

---

## 异常场景

- bundled 模板技能缺失：启动或 package verify 必须失败并输出缺失 skill 名称。
- bundled 技能存在但 `SKILL.md` 缺失：SkillService 返回明确错误，不回退到空内容。
- 用户同名技能损坏且不带系统标识：不得被内置模板静默覆盖，应给出来源和错误，不误报 bundled missing。

---

## 依赖关系

- 依赖技能多源加载实现：`packages/core/src/lib/integrations/pi-agent/core/skills.ts` 或相关 SkillService。
- 依赖桌面 packaged path 适配：`packages/desktop/src/main/**`、`packages/desktop/scripts/**`。
- 依赖首页内置应用配置：`packages/web/src/config/homeApps.ts`。
