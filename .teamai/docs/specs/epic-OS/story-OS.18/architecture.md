# 架构设计文档 - Story OS.18

**Story:** Windows 内置模板技能加载修复
**版本:** 1.0
**最后更新:** 2026-07-25

---

## 架构目标

修复 Windows packaged build 中内置模板技能无法加载的问题，并消除首次运行与后续运行的目录分裂。实现应把 bundled/template skills 作为只读初始化源，首次点击或启动前按需 materialize 到 `data/skills/{skill}`，之后 SkillDialog、Agent 启动、工作空间入口、记忆和产物都使用该 data 目录。

---

## 已知故障信号

```text
[2026-07-23T10:33:30.230Z] ERROR [SkillService] Get skill content failed
SkillServiceError: Skill "skill-creator-app" not found
```

该错误说明首页配置中的内置 skill id 可以触发查询，但 SkillService 的 source roots 没有在 Windows packaged 环境找到 bundled/template skill。

---

## 影响模块

| 模块 | 文件范围 | 变更方向 |
|------|----------|----------|
| Core 技能加载 | `packages/core/src/lib/integrations/pi-agent/core/skills.ts` 或 SkillService 实现 | 增加 bundled/template source 解析、materialize 和 system 标识 |
| Core 路径工具 | `packages/core/src/lib/paths.ts` 或 shared path helper | 统一开发态/packaged skill root 计算 |
| Desktop 主进程/服务 | `packages/desktop/src/main/services/**` | 传入 packaged resources path 或初始化 bundled skill roots |
| Desktop 打包脚本 | `packages/desktop/scripts/prepare-*`, `electron-builder.yml` | 确保模板技能进入 package resources |
| Web 配置 | `packages/web/src/config/homeApps.ts` | 确认 `skill-creator-app` id 与 bundled skill 目录一致 |
| 验证脚本 | `packages/desktop/scripts/verify-windows-package.js` | 校验内置技能资源存在 |

---

## 依赖方向

```text
packages/web/src/config/homeApps.ts
  -> SkillDialog / API boundary
  -> @originos/core SkillService public API
  -> core path/source resolver

packages/desktop/src/main/services/*
  -> @originos/core public API
  -> Node/Electron process.resourcesPath

packages/desktop/scripts/*
  -> package resources verification only
```

符合 AGENTS.md：

- Web 页面与组件不直接依赖 Electron main。
- 技能加载主逻辑位于 core 集成层或 feature 公共 API。
- Desktop 只提供 Electron packaged path 适配，不复制 core 业务逻辑。
- 不修改 `dist-electron`、`.next`、`node_modules` 作为源码入口。
- `.claude/skills`、`.agents/skills`、`templates/skills` 等定义目录保持只读，只作为 materialize 来源。

---

## 数据/API/状态方案

- 不新增数据库。
- 不迁移或删除用户现有自定义 `data/skills`。
- 内置模板技能 materialized 到 `data/skills/{skill}` 后，`SKILL.md` 必须保留 `originos-system: true`。
- Skill content API/IPC 返回的 `baseDir`、`workingDir` 对内置技能应指向 materialized data 目录，便于工作空间入口和运行产物一致。
- 用户自定义技能列表、`/api/user-skills` 和 `list_skills` 工具必须过滤带 `originos-system: true` 的目录。

---

## 推荐实现策略

### 1. 显式声明 bundled skill roots

建立一个统一函数，例如：

```typescript
resolveBundledSkillRoots(options): string[]
```

候选路径应覆盖：

- 开发态仓库模板技能目录。
- Electron `process.resourcesPath` 下随包分发的模板技能目录。
- `app.asar.unpacked` 或 resources sidecar 中的技能目录。

### 2. SkillService 多源查询

查询顺序必须可测试：

1. project context skill root（如有）
2. user installed skill root（如有）
3. system-managed materialized skill root
4. bundled/template skill roots as initialization source

若 `data/skills/{skill}` 已存在且不带 `originos-system: true`，不得用内置模板覆盖，避免静默破坏用户自定义技能。

### 3. 按需 materialize

Windows package 应包含 bundled/template skills。首次点击或启动内置技能时，从 `resources/templates/skills/{skill}` 复制到 `data/skills/{skill}`，并让本次运行使用复制后的目录。

### 4. 打包资源进入 release

Windows package 应包含 bundled/template skills，当前 canonical source 为 `resources/templates/skills`。

### 5. 日志可诊断

`SkillServiceError` 应包含：

- skill name
- searched roots
- current runtime mode（dev/packaged）
- selected source（成功时 debug）

---

## 性能与安全

- skill root 扫描只读取已知目录，不递归扫描用户整个 home。
- source roots 应做路径归一化和越界保护。
- 单次技能内容读取应保持在 500ms 内。
- bundled/template 目录只读，Agent 工具只能写 materialized data 目录或显式 outputDir。
