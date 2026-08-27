# Changelog

---

## 2026-08-19 — docs：按 startupOS 架构围栏重构 Epic ONT

**类型**：docs
**影响模块**：`docs/specs/epic-ONT/README.md`
**摘要**：按 startupOS 的 monorepo 和模块围栏重构 Epic ONT 设计：ONT 收敛为 `packages/core` 内的 ontology bounded context，只交付 canonical schema、DataFile/JSONL store、validator、OSDK、contract validation API 和 Context Projection Protocol。Epic P2、Epic 9/collaboration-runtime、Epic C/M/T 作为下游消费方继续负责 Agent+Skill 方案、多 Agent supervisor/worker runtime、记忆与 TASTE，不迁入 ONT。

---

## 2026-08-07 — release：OriginOS CE 0.1.47

**类型**：release
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/core/src/lib/integrations/pi-agent/`, `packages/desktop/`, `packages/agent/`, `docs/changes/releases/v0.1.47/changelog.md`
**摘要**：发布 OriginOS CE `0.1.47`。修复 Windows 多 Agent worker、CompletionGuard、项目技能补齐和受控 Pi Task Runtime 校验；发布流程每次成功发布都会创建或更新对应的 GitHub Release，并不再要求 `.zip.blockmap`。

## 2026-07-30 — fix：恢复窗体历史会话与执行上下文

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/`, `packages/desktop/src/main/services/agent-session-service.ts`, `packages/web/src/components/skills/SkillDialog.tsx`, `packages/web/src/components/os/agent-dialog/AgentDialogContent.tsx`
**摘要**：将 OriginOS CE 桌面版本更新到 `0.1.46`。Skill、Agent 和 RoleAgent 窗体现在可以恢复历史 Session 的可见消息与执行上下文；增加 ownership 校验、并发切换 epoch、旧 stream 隔离和结构化错误，并修复删除冒泡、欢迎语重发及 Core package export 缺口。

## 2026-07-25 — fix：mac 自动更新元数据使用 zip

**类型**：fix
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/generate-update-metadata.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/verify-update-metadata.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.39`。macOS Actions artifacts 重新上传 zip 和 zip.blockmap，mac 更新元数据只在 x64/arm64 zip 成对存在时生成，避免 electron-updater 报 `zip file not provided`。

## 2026-07-25 — fix：发布前生成全平台更新元数据

**类型**：fix
**影响模块**：`.github/workflows/desktop-release.yml`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.38`。Qiniu publish job 在下载三平台 artifacts 后先运行 `generate:update-metadata`，再执行 `verify:release-artifacts`，确保 mac metadata 在发布前验证阶段已经生成。

## 2026-07-25 — fix：避免 Windows zip 误触发 mac 元数据校验

**类型**：fix
**影响模块**：`packages/desktop/scripts/verify-update-metadata.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.37`。`verify:update-metadata` 只有在同时存在 macOS x64/arm64 zip 或 x64/arm64 dmg 时才校验 mac metadata，避免 Windows job 里的 x64 zip 被误判为 mac zip 导致 `latest-mac.yml` 缺失失败。

## 2026-07-25 — fix：发布 macOS 更新元数据

**类型**：fix
**影响模块**：`packages/desktop/scripts/generate-update-metadata.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/verify-update-metadata.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.36`。macOS 发布产物没有 zip 时会基于 x64/arm64 dmg 生成 `latest-mac.yml` / `stable-mac.yml`，发布脚本会上传并校验 mac metadata，避免 CDN mac 更新元数据停留在旧版本。

## 2026-07-25 — release：重新验证 Apple notarization secrets

**类型**：release
**影响模块**：`.gitignore`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.35`，用于在 GitHub Actions secrets 重新配置后触发完整桌面构建发布链路。保留 `*.p8` / `AuthKey_*.p8` ignore 规则，防止 Apple API 私钥误提交。

## 2026-07-25 — ci：公开 Apple notarization 预检失败原因

**类型**：ci
**影响模块**：`packages/desktop/scripts/verify-apple-notary-credentials.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.34`。Apple notarization 凭据预检失败时会写入 GitHub Actions error annotation，让公开检查结果直接显示 App Store Connect 认证失败原因，而不是只有 generic exit code。

## 2026-07-25 — ci：前移 Apple notarization 凭据预检

**类型**：ci
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/verify-apple-notary-credentials.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.33`。macOS Actions 在 build:app 前安装 rcodesign 并调用 `notary-list` 验证 App Store Connect Notary API 凭据，避免错误的 `APPLE_API_ISSUER` / `APPLE_API_KEY_ID` / `APPLE_API_KEY` 组合在完整打包后才失败。

## 2026-07-25 — fix：为 macOS 公证加入 rcodesign fallback

**类型**：fix
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/notarize-mac-app.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.32`。GitHub macOS runner 上 `xcrun notarytool submit` 会以 `SIGTRAP` / `SIGILL` 崩溃且无输出；CI 现在预装 `rcodesign`，当 notarytool 发生这类崩溃时自动使用 rcodesign 通过 App Store Connect API 完成 notarization 和 stapling。

## 2026-07-25 — fix：改为轮询 macOS 公证状态

**类型**：fix
**影响模块**：`packages/desktop/scripts/notarize-mac-app.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.31`。macOS notarization 不再使用 `notarytool submit --wait`，改为 submit 后通过 submission id 轮询 `notarytool info`，并为 submit/info/log/stapler 加子进程超时和状态日志，避免 GitHub runner 在 Apple 公证等待阶段长时间无输出。

## 2026-07-25 — fix：兼容 notarytool 空 JSON 输出

**类型**：fix
**影响模块**：`packages/desktop/scripts/notarize-mac-app.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.30`。macOS 手动公证保留 Apple API issuer；当 `notarytool submit --wait --output-format json` 以 exit code 0 返回空输出时，不再错误地去掉 issuer 重试，而是继续执行 `stapler staple`，由 stapler 验证 notarization 是否真实可用。

## 2026-07-25 — fix：拆出 macOS 手动公证流程

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`, `packages/desktop/scripts/notarize-mac-app.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.29`。关闭 electron-builder 内置 notarization，改由 afterSign hook 手动 zip `.app`、调用 `xcrun notarytool submit`、验收后 `stapler staple`，并在 API Key issuer 导致空输出时自动重试不带 issuer 的提交路径。

## 2026-07-25 — ci：暴露 macOS electron-builder 失败摘要

**类型**：ci
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/run-electron-builder-mac.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.28`。macOS Actions 通过包装脚本运行 electron-builder，失败时将尾部日志写入 GitHub annotation，避免公开 Actions API 无法读取完整 job log 时无法定位 notarization 真实错误。

## 2026-07-25 — ci：移除不可靠的 notarytool history 预检

**类型**：ci
**影响模块**：`.github/workflows/desktop-release.yml`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.27`。移除 macOS runner 上会以 exit code 133 崩溃的 `xcrun notarytool history` 预检，保留 Apple API key 的 PKCS#8 规范化，让 electron-builder 执行正式 notarization。

## 2026-07-25 — ci：增加 Apple Notary 凭据预检

**类型**：ci
**影响模块**：`.github/workflows/desktop-release.yml`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.26`。macOS Actions 在 electron-builder 前先执行 `xcrun notarytool history`，直接验证规范化后的 `.p8`、Key ID 和 Issuer，缩短 notarization 失败定位路径。

## 2026-07-25 — fix：将 Apple API Key 规范化为 PKCS#8

**类型**：fix
**影响模块**：`packages/desktop/scripts/prepare-apple-api-key.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.25`。macOS notarization 前会把可解析的 EC private key 统一导出为 PKCS#8 PEM，避免 notarytool 对非 PKCS#8 ASN.1 私钥报 `invalidAsn1`。

## 2026-07-25 — fix：规范化 macOS 公证 Apple API Key

**类型**：fix
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/prepare-apple-api-key.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.24`。macOS Actions 在 notarization 前会把 `APPLE_API_KEY` secret 规范化为 `.p8` 文件，支持原始 PEM、带 `\n` 转义的 PEM 和 base64 PEM，并提前用 Node crypto 校验私钥格式，避免 electron-builder 阶段只返回 `invalidAsn1`。

## 2026-07-25 — release：发布桌面版本 0.1.23

**类型**：release
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/skills.ts`, `packages/core/src/lib/features/skills/service.ts`, `.github/workflows/desktop-release.yml`, `packages/desktop/scripts/verify-mac-signing.js`, `package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 桌面发布版本更新到 `0.1.23`。修复 Windows CRLF `SKILL.md` 导致内置技能已存在但内容接口 404 的问题；恢复 macOS notarization，并在发布验证中加入 Gatekeeper 检查，防止下载后提示身份不明开发者。

## 2026-07-25 — docs：更新应用版本到 0.1.22

**类型**：docs
**影响模块**：`package.json`, `packages/desktop/package.json`, `docs/changes/releases/v0.1.22/changelog.md`
**摘要**：将 OriginOS CE 桌面发布版本从 `0.1.19` 更新到 `0.1.22`，用于发布内置技能按需 materialize、系统技能过滤和 macOS `pi-agent-core` runtime 校验修复。远端已存在失败的 `0.1.20/0.1.21` tag，因此本次使用新的补丁版本。

## 2026-07-25 — fix：内置技能按需同步到 data 后运行

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/skills.ts`, `packages/core/src/lib/features/skills/service.ts`, `packages/core/src/lib/features/services/launcher/skill.ts`, `packages/core/src/lib/features/user-registry/index.ts`, `packages/core/src/lib/integrations/pi-agent/tools/skill-tools.ts`, `templates/skills/*/SKILL.md`
**摘要**：内置模板技能首次点击或启动前会从 `resources/templates/skills/{skill}` 同步到 `data/skills/{skill}`，本次 SkillDialog 和 Agent 启动即使用 data 目录，避免第一次和后续运行的记忆、附件、工作空间与产物目录不一致。内置模板 `SKILL.md` 增加 `originos-system: true` 元数据，用户自定义技能区域、`/api/user-skills` 和 `list_skills` 工具会过滤这些系统技能。

## 2026-07-24 — fix：修复 macOS 包缺失 pi-agent-core 运行依赖

**类型**：fix
**影响模块**：`packages/desktop/package.json`, `packages/desktop/electron-builder.yml`, `packages/desktop/scripts/verify-mac-package.js`, `.github/workflows/desktop-release.yml`, `pnpm-lock.yaml`
**摘要**：macOS 0.1.19 安装包打开时报 `Cannot find module '@mariozechner/pi-agent-core'`，原因是 `@mariozechner/agent` 的 workspace 包运行时转发到 `pi-agent-core`，但 desktop 包没有显式声明该依赖，Mac 构建也只有签名校验，没有 app.asar runtime smoke check。现在 desktop 显式依赖 `@mariozechner/pi-agent-core`，electron-builder 从 desktop package 边界复制该依赖，并在 macOS arm64/x64 Actions 中新增 `verify:mac-package` 校验。

## 2026-07-24 — fix：对齐 0.1.19 Windows 本地与 Actions 包校验

**类型**：fix
**影响模块**：`packages/desktop/scripts/verify-windows-package.js`, `package.json`, `packages/desktop/package.json`, `docs/changes/releases/v0.1.19/changelog.md`
**摘要**：将桌面版本回退到 `0.1.19` 继续发布，并修复 Windows package verifier 对 `SkillLauncher` runtime 的读取方式。Verifier 现在先确认 required entries 无缺失再进入 smoke check，并基于 `asar.extractAll()` 后的实际运行视图读取 `skill.js`，避免 Actions 中因 asar/unpacked 路径差异抛误导性的 `was not found in this archive` 异常。本地已通过完整 Windows 构建和 `verify:win-package`。

## 2026-07-24 — docs：更新应用版本到 0.1.21

**类型**：docs
**影响模块**：`package.json`, `packages/desktop/package.json`, `docs/changes/releases/v0.1.21/changelog.md`
**摘要**：将 OriginOS CE 桌面发布版本从 `0.1.20` 更新到 `0.1.21`，用于重新触发包含 Windows verifier unpacked runtime 修复的发布链路。

## 2026-07-24 — fix：修复 Windows package verifier 读取 unpacked runtime

**类型**：fix
**影响模块**：`packages/desktop/scripts/verify-windows-package.js`
**摘要**：Windows package verifier 检查 `SkillLauncher` runtime 时，`asar.listPackage(..., { isPack: true })` 会列出 unpacked 文件，但 `asar.extractFile()` 不能读取 unpacked 条目，导致 GitHub Actions 在 `verify:win-package` 阶段抛 `"dist-electron/core/src/lib/features/services/launcher/skill.js" was not found in this archive`。现在读取 runtime 时会先尝试 app.asar，失败后回退到 `resources/app.asar.unpacked`。

## 2026-07-24 — docs：更新应用版本到 0.1.20

**类型**：docs
**影响模块**：`package.json`, `packages/desktop/package.json`, `docs/changes/releases/v0.1.20/changelog.md`
**摘要**：将 OriginOS CE 桌面发布版本从 `0.1.19` 更新到 `0.1.20`，用于发布包含 Windows 内置 skill fallback 和角色附件按钮修复的完整安装包。

## 2026-07-24 — fix：修复角色窗体附件按钮禁用

**类型**：fix
**影响模块**：`packages/web/src/components/ui/chat-input-bar.tsx`, `packages/web/src/components/ui/__tests__/chat-input-bar.test.tsx`
**摘要**：角色 Agent 窗体会在 running/thinking 状态下禁用输入框，`ChatInputBar` 之前把同一个 disabled 状态复用到附件按钮，导致 Windows 版本中创建出来的角色点击上传附件按钮没有反应。附件按钮现在只在上传进行中禁用，即使消息输入暂时不可发送，也可以正常打开文件选择器。

## 2026-07-24 — docs：更新应用版本到 0.1.19

**类型**：docs
**影响模块**：`package.json`, `packages/desktop/package.json`, `docs/changes/releases/v0.1.19/changelog.md`
**摘要**：将 OriginOS CE 桌面发布版本从 `0.1.18` 更新到 `0.1.19`，用于触发 `desktop-v0.1.19` GitHub Actions 发布，把 Windows 安装态内置 skill bundled fallback 修复推送给已安装 0.1.18 的用户。

## 2026-07-24 — fix：修复 Windows 安装态内置 skill bundled fallback

**类型**：fix
**影响模块**：`packages/core/src/lib/features/services/launcher/skill.ts`, `packages/core/src/lib/features/services/launcher/__tests__/skill-launcher.test.ts`, `packages/desktop/scripts/verify-windows-package.js`, `docs/specs/epic-OS/story-OS.18/**`
**摘要**：官网 0.1.18 Windows 包内实际包含 `resources/templates/skills/skill-creator-app/SKILL.md`，但安装态 `SkillLauncher` 只取第一个存在的 bundled skill root，当前序候选目录存在但缺少目标 skill 时会报 not found。修复为遍历所有 `getBundledSkillDirs()`，并在 Windows package verifier 中检查编译后 launcher runtime 包含多 bundled root fallback，避免资源存在但运行时选错路径。

## 2026-07-24 — docs：更新应用版本到 0.1.18

**类型**：docs
**影响模块**：`package.json`, `packages/desktop/package.json`, `docs/changes/releases/v0.1.18/changelog.md`
**摘要**：将 OriginOS CE 桌面发布版本从 `0.1.17` 更新到 `0.1.18`，用于触发 `desktop-v0.1.18` GitHub Actions 发布。新增 v0.1.18 版本归档，包含 Windows 内置模板技能加载、pi-ai provider 依赖、自动更新 sha512 metadata 校验和构建产物忽略规则等修复说明。

## 2026-07-24 — docs：归档 Story OS.18 Windows 内置模板技能加载修复

**类型**：docs
**影响模块**：`docs/specs/epic-OS/README.md`, `docs/specs/epic-OS/story-OS.18/**`, `docs/changes/releases/v0.1.17/changelog.md`
**摘要**：Story OS.18 标记为 ✅ Complete，补齐完成归档、实施摘要、测试验证记录和 Epic OS 状态。归档记录覆盖 Windows packaged build 读取 `skill-creator-app`、模板技能不复制到用户 `data/skills`、本地 Windows 包构建验证、`pi-ai` provider 依赖打包和 `verify:win-package` 通过结果。

## 2026-07-24 — fix：修复 Windows 自动更新 sha512 mismatch

**类型**：fix
**影响模块**：`.github/workflows/desktop-release.yml`, `packages/desktop/scripts/generate-update-metadata.js`, `packages/desktop/scripts/verify-update-metadata.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/package.json`
**摘要**：Windows 构建完成后由项目脚本重写 update metadata，确保 `latest-win.yml`、`stable-win.yml`、`latest.yml`、`stable.yml` 都指向 NSIS `.exe` 且 sha512/size 与本地产物一致。GitHub Actions 在上传 Windows artifact 前执行 metadata 校验，七牛发布脚本上传资源后刷新 CDN 并下载远端内容重新计算 sha512，若 CDN 返回旧资源或 metadata 不匹配则发布失败，避免客户端自动更新出现 `sha512 checksum mismatch`。

## 2026-07-24 — chore：移除已跟踪桌面构建产物

**类型**：chore
**影响模块**：`.gitignore`, `packages/desktop/.packaging/**`, `packages/desktop/dist-electron/**`
**摘要**：将嵌套 `dist-electron` 和 `.packaging` 构建产物加入忽略规则，并从 Git 索引移除已跟踪的桌面 standalone 与 Electron 编译产物，避免后续本地构建污染工作区。

## 2026-07-24 — fix：Windows 包打入 pi-ai provider 动态依赖

**类型**：fix
**影响模块**：`packages/desktop/scripts/prepare-pi-ai-runtime-deps.js`, `packages/desktop/scripts/build-windows-local.js`, `packages/desktop/scripts/verify-windows-package.js`, `packages/desktop/electron-builder.yml`, `package.json`, `pnpm-lock.yaml`
**摘要**：本地 Windows 构建入口固定为 `pnpm@9.15.9` frozen install，与 GitHub Actions Windows job 对齐；打包前从 `@mariozechner/pi-ai` 实际安装目录收集 109 个动态 provider runtime 依赖并写入 package files，修复安装后 `Cannot find module '@google/genai'`。Windows package verifier 现在会实际 resolve/import Google GenAI、Bedrock、Mistral、proxy-agent 等依赖，避免只校验元数据。

## 2026-07-20 — fix：多 Agent 子进程漏传 mapping 字段

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：WorkerModelConfig 类型和 createWorkerModel 函数缺少 mapping 字段，导致用户在设置页配置的字段映射（如 max_tokens → max_completion_tokens）无法传递到多 Agent 子进程。添加 mapping 到 WorkerModelConfig 类型定义、summarizeWorkerModel 调试输出、createWorkerModel 调试日志和 createRuntimeModel 调用参数。

## 2026-07-20 — docs：README 移除不存在的数据目录

**类型**：docs
**影响模块**：`README.md`
**摘要**：移除 README 数据目录清单中当前项目不存在的 `data/interviews/` 和 `data/ontology/` 项，避免开源文档描述与实际运行时目录不一致。

## 2026-07-20 — docs：README LLM 配置改为跟随用户设置

**类型**：docs
**影响模块**：`README.md`
**摘要**：移除 README 中 `.env` 和环境变量形式的 LLM 配置示例，改为说明模型配置由应用设置页管理并随用户设置生效，避免开源读者误以为运行时配置入口依赖本地环境文件。

## 2026-07-20 — fix：规避桌面构建在仓库根目录生成产物

**类型**：fix
**影响模块**：`scripts/check-root-build-artifacts.js`, `package.json`, `packages/desktop/package.json`, `README.md`
**摘要**：新增根目录构建产物检查脚本，禁止构建/打包过程在仓库根目录遗留误生成的 `*.js`、`*.d.ts`、`*.map` 或 `*.tsbuildinfo` 文件。桌面 `build:app` 在编译后和同步产物后都会执行检查，README 同步更新为当前 PRD 的 Agent 工作台定位、人与 AI 共生愿景，以及“用户定义问题，系统以 AI Native 方式生产应用/流程/协作结构”的下一代操作系统使命，并补充 Windows 打包产物与构建产物约束说明。

## 2026-07-15 — docs：更新当前实现版 PRD 并新增产品白皮书

**类型**：docs
**影响模块**：`docs/product/PRD-Main.md`, `docs/product/OriginOS-CE-Whitepaper.md`
**摘要**：根据当前代码实现重写 OriginOS CE PRD，将首页工作台、Agent/Skill、项目、定时任务、系统通知、认知沉淀、多 Agent 协作、桌面打包与自动更新纳入当前产品范围。新增产品说明白皮书，面向非研发读者说明产品定位、能力版图、典型场景、技术架构、部署与后续方向。

## 2026-07-15 — docs：新增官网产品 PR 稿

**类型**：docs
**影响模块**：`docs/product/OriginOS-CE-Website-PR.md`
**摘要**：基于产品概念愿景和当前 PRD 新增官网投放用产品 PR 稿，弱化技术语言，突出个人业务操作系统、长期协作角色、技能、项目空间、通知定时任务和经验沉淀等当前可表达的产品能力。

## 2026-07-15 — fix：恢复多 Agent 协同图白底

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/ui/TopologyGraph.tsx`, `src/modules/collaboration-runtime/ui/TopologyGraph.tsx`
**摘要**：将多 Agent 协同拓扑图从深色画布恢复为白底浅灰网格，调整标题、图例、边标签和阴影颜色，降低整体背景压暗感并保持连线与节点状态可读。

## 2026-07-15 — fix：修复多 Agent 协同图节点文字对比度

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/ui/TopologyGraph.tsx`, `src/modules/collaboration-runtime/ui/TopologyGraph.tsx`
**摘要**：多 Agent 协同图节点从深色块调整为简洁浅色信息卡，节点状态和图谱标题改为中文展示；节点名称与领域在源数据无中文时使用中文兜底文案，移除节点编号行、顶部状态栏和装饰图形，并让 SVG 视图以 fit view 方式完整适配画布。

## 2026-07-15 — docs：更新应用版本到 0.1.13

**类型**：docs
**影响模块**：`package.json`, `packages/desktop/package.json`
**摘要**：将 OriginOS CE 应用发布版本从 `0.1.12` 更新到 `0.1.13`，用于下一轮桌面包和发布产物命名。

## 2026-07-15 — feat：LLM 配置支持请求字段映射

**类型**：feat
**影响模块**：`packages/core/src/lib/integrations/pi-agent/llm-config.ts`, `packages/core/src/lib/integrations/pi-agent/server-config.ts`, `packages/core/src/lib/features/user-config/index.ts`, `packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/web/src/store/settingsStore.ts`, `packages/web/src/components/os/settings/SettingsDialog.tsx`
**摘要**：LLM 运行时配置新增 `mapping` 字段，可通过设置页 JSON 配置请求字段映射，例如将 `max_tokens` 映射为 `max_completion_tokens`。OpenAI-compatible 模型创建时会使用该映射覆盖底层 `compat.maxTokensField`，并随用户配置持久化。

## 2026-07-14 — fix：解决 Windows 安装包 zip 长路径问题

**类型**：fix
**影响模块**：`packages/desktop/scripts/prepare-web-standalone.js`, `packages/desktop/package.json`
**摘要**：修复 Windows 平台安装包 zip 文件中路径超过 260 字符限制的问题。通过 `ORIGINOS_WINDOWS_SHORT_ZIP=1` 环境变量，在构建 standalone 时移除根 `.pnpm` store 目录，将最长路径从 200+ 字符缩短至 152 字符，确保 Windows 用户能正常解压安装。

## 2026-07-06 — fix：关闭 Agent 窗口时刷新 Pattern 快照

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/agent-manager.ts`, `packages/web/src/app/api/agent/sessions/destroy/route.ts`, `packages/web/src/app/api/agent/sessions/[sessionId]/destroy/route.ts`, `packages/desktop/src/main/services/agent-session-service.ts`, `src/lib/integrations/pi-agent/agent-manager.ts`, `src/app/api/agent/sessions/destroy/route.ts`, `src/app/api/agent/sessions/[sessionId]/destroy/route.ts`
**摘要**：修复 role/project/skill 这类 in-process Agent 关闭窗口时只销毁 Agent、未触发 `CognitiveManager.on_session_end()` 的问题。AgentManager 现在在移除实例前会先 flush cognitive session end，使 PatternProvider 有机会从 archival 重建 `Patterns.md`。

## 2026-07-06 — docs：新增 A2UI 生成式交互卡片 Epic 规划

**类型**：docs
**影响模块**：`docs/specs/epic-A2UI/README.md`, `docs/specs/epic-A2UI/story-A2UI.1/README.md`, `docs/specs/epic-A2UI/story-A2UI.2/README.md`, `docs/specs/epic-A2UI/story-A2UI.3/README.md`, `docs/specs/epic-A2UI/story-A2UI.4/README.md`, `docs/specs/epic-A2UI/story-A2UI.5/README.md`, `docs/index.md`
**摘要**：新增 Epic A2UI，规划通过 Agent-to-UI 协议承载生成式交互卡片，将 ECharts 图表、表格、指标、表单、确认卡和进度状态纳入受控协议与组件注册表。该变更仅包含 Epic 与 Story 规划，不包含实现代码。

## 2026-07-05 — refactor：优化多 Agent 协作拓扑视觉样式

**类型**：refactor
**影响模块**：`packages/core/src/modules/collaboration-runtime/ui/TopologyGraph.tsx`, `packages/core/src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx`, `src/modules/collaboration-runtime/ui/TopologyGraph.tsx`
**摘要**：将协作拓扑从浅色卡片式图谱升级为深色科技风网格视图，增强节点状态发光、边连线层次、标签可读性和拓扑面板标题。节点文本增加截断处理，避免长 Agent 名称或 ID 溢出影响布局。

## 2026-07-05 — fix：阻止发布 adhoc 签名的 macOS 自动更新包

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`, `packages/desktop/package.json`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/verify-mac-signing.js`, `resources/entitlements.mac.plist`, `resources/entitlements.mac.inherit.plist`, `.env.example`
**摘要**：修复 macOS 自动更新安装时报 “Code signature did not pass validation” 的发布链路问题。桌面端 mac 构建现在强制 Developer ID 签名并启用 hardened runtime/entitlements/notarize；七牛发布前会校验 app 不是 adhoc 签名且包含 TeamIdentifier，避免发布 Squirrel.Mac 无法安装的更新包。

## 2026-06-29 — fix：收敛 Agent Runtime 工具上下文目录语义

**类型**：fix
**影响模块**：`docs/specs/epic-OS/README.md`, `docs/specs/epic-OS/story-OS.14/README.md`, `packages/core/src/lib/integrations/pi-agent/tools/context.ts`, `packages/core/src/lib/integrations/pi-agent/agent-manager.ts`, `packages/core/src/lib/integrations/pi-agent/tools/file-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/url-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/bash-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/skill-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/__tests__/working-directory.test.ts`
**摘要**：新增 Epic OS / Story OS.14，明确工具层只接收 `workingDirectory`，`outputDir` 只属于 Agent / Runtime / Prompt 层。移除 `ToolExecutionContext.skillOutputDir`、AgentManager 输出目录注入、Skill 元工具对全局工具上下文的修改以及 Bash 工具从 tool context 注入 `SKILL_OUTPUT_DIR` 的逻辑，避免项目根目录与输出目录在工具层发生语义混用。

## 2026-06-26 — docs：新增 Agent 记忆管线重构 Story（OS.13 / M.11）

**类型**：docs
**影响模块**：`docs/specs/epic-OS/README.md`、`docs/specs/epic-OS/story-OS.13/README.md`、`docs/specs/epic-M/README.md`、`docs/specs/epic-M/story-M.11/README.md`
**摘要**：在 Epic OS 新增 OS.13，规划统一 Agent 记忆使用路径、保护 Recent Trace、退出 Dream 主路径并治理 loop 风险；在 Epic Memory 新增 M.11，规划由 memory-core 统一 history-to-cognition 管线并替代 Dream 的长期记忆整理职责。两条 Story 明确了 `Memory.md`、Recall、Pattern/Reflection 与运行时上下文的职责边界。

## 2026-06-26 — fix：多 Agent 后续消息覆盖未归一化的 LLM 配置

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/facade/hitl-dispatcher.ts`、`packages/core/src/lib/integrations/electron/services/collaboration.ts`、`packages/core/src/modules/collaboration-runtime/sandbox/agent-spawner.ts`
**摘要**：修复多 Agent 协作链路的两层 LLM 配置问题：一是后续消息会原样覆盖 session 中的 `llmConfig`，导致 Anthropic 归一化凭证字段可能丢失；二是多 Agent 子进程在已有显式 runtime model 的情况下仍会额外注入 `.env` 中的 LLM 凭证，造成运行时模型与子进程环境冲突。现在消息入口会重新归一化 `llmConfig`，并且多 Agent worker 在使用显式模型时会剥离托管 LLM 环境变量，只保留父进程下发的运行时模型配置。

## 2026-06-25 — fix：多 Agent 协作子进程 401 认证失败

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/server-config.ts`、`packages/core/src/lib/integrations/pi-agent/core/agent.ts`
**摘要**：修复多 Agent 协作运行时子进程 401 Invalid API Key 问题，三层根因：
1. `createRuntimeModel` 中当 `anthropicCredentialSource` 为 `"authToken"` 时，`anthropicOptionCredential` 被设为 `undefined`，导致 `createAnthropicModel` 的 options 中没有 `apiKey`。修复：始终传递 `anthropicApiKey || anthropicAuthToken` 到 options.apiKey。
2. `streamFnWithToolChoice` 将 Bearer Authorization header 设在 `streamModel.headers` 上，但 `pi-ai` 库的 Anthropic provider 从 `options.headers` 读取自定义 header。修复：将 headers 移到 `opts` 对象中传递。
3. 主进程 `createAutoModel` 会检测 `shouldUseOpenAICompatible()`（baseUrl + 自定义 token + 非 Claude 模型时返回 true）走 OpenAI 兼容端点 `/v1/chat/completions`，但子进程 `createRuntimeModel` 看到 `provider: 'anthropic'` 就直接走 Anthropic 原生端点 `/v1/messages`，代理只支持前者。修复：在 `createRuntimeModel` 的 anthropic 分支中也检查 `shouldUseOpenAICompatible()`。

## 2026-06-25 — feat：新增桌面端首次引导动画

**类型**：feat
**影响模块**：`packages/web/src/components/os/DesktopOnboarding.tsx`、`packages/web/src/app/page.tsx`
**摘要**：新增桌面端引导覆盖层，首次进入自动播放并可从顶部帮助按钮重播。引导内容覆盖桌面总览、Dock 区、项目、内置应用、Agent 与技能，并会高亮对应页面位置、将说明气泡锚定到目标区域。

## 2026-06-25 — fix：桌面端 Dock hover 名称完整显示

**类型**：fix
**影响模块**：`packages/desktop/src/main/window-manager.ts`、`packages/web/src/components/os/dock/Tooltip.tsx`
**摘要**：修复 Electron 桌面端左侧 Dock hover 名称被独立 Dock BrowserWindow 宽度裁切的问题。Dock hover 展开时现在同步扩大透明窗口宽度，Tooltip 自身增加最大宽度与长文本换行，确保较长应用名可完整显示。

## 2026-06-24 — fix：solution-design 复用会话后实时刷新模型认证字段

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/setup.ts`
**摘要**：修复 `OriginOSAgent` 在初始化时将 `apiKey`、`authToken` 和 `credentialAuthMode` 缓存在 `streamFn` 闭包中的问题，导致 `SolutionDesign` 这类复用 session 后即使 `setModel()` 应用了新配置，请求仍可能沿用旧的 bearer/api-key 认证状态并触发 401。现在每次发起 LLM 请求都会从当前 model 实时读取认证字段，并补充了 bearer 切换到 api-key 的回归测试覆盖。

## 2026-06-24 — fix：solution-design 会话继承项目工作目录与输出目录

**类型**：fix
**影响模块**：`packages/web/src/components/solution/SolutionDesign.tsx`、`packages/desktop/src/main/services/agent-session-service.ts`
**摘要**：修复从项目启动 `solution-design` 时，后续 `agent:session:create` 没有携带 `agentBaseDir`/`outputDir`/`agentType`，导致项目技能会话退化成无项目上下文的通用 Agent，会话复用时还会保留旧的空上下文。现在 `SolutionDesign` 会显式传入项目目录和 `solutions/` 输出目录，桌面端复用已有 session 时也会同步更新 `projectContext` 与 `llmConfig`。

## 2026-06-24 — fix：桌面端跨窗体同步项目更新事件

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/project-service.ts`、`packages/core/src/lib/integrations/electron/ipc-protocol.ts`、`packages/desktop/src/main/ipc-protocol.ts`、`packages/web/src/app/page.tsx`
**摘要**：修复 Electron 桌面端访谈窗更新项目名称后首页项目卡片不刷新的问题。根因是 renderer 内的 `window.dispatchEvent('project:updated')` 只在当前窗体有效，无法跨 native window 传递；现在主进程在 `project:update` 成功后通过新的 `project:event` IPC 广播给所有窗体，首页收到 `project_updated` 后立即重新加载项目列表。

## 2026-06-24 — fix：访谈完成后项目卡片立即刷新名称与状态

**类型**：fix
**影响模块**：`packages/web/src/components/interview/InterviewWindow.tsx`、`packages/web/src/app/page.tsx`
**摘要**：修复业务访谈完成并写入 `business-model.json` 后，项目卡片名称、描述、领域和状态没有及时更新的问题。访谈完成现在先更新 `project.json` 并广播 `project:updated` 事件，首页收到事件后立即重新拉取项目列表；`syncProjectOntology` 失败不再阻断 UI 刷新。

## 2026-06-24 — fix：项目初始化默认复制 6 个项目技能

**类型**：fix
**影响模块**：`packages/web/src/app/api/projects/[id]/agent/initialize/route.ts`、`packages/desktop/src/main/services/project-service.ts`
**摘要**：修复项目初始化仅复制 `domain-discovery`、`business-refinement`、`model-review` 三个访谈技能的问题。现在 Web 与桌面端都会默认复制 `solution-design`、`project-skill-creator`、`agent-creator`，确保新项目创建后即可直接进入方案设计与 Agent/Skill 生成流程。

## 2026-06-24 — fix：桌面端项目初始化补齐访谈模板与三阶段技能

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/project-service.ts`、`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`、`packages/core/src/lib/features/services/project-initialization-service.ts`、`templates/project-interview/Tool.md`
**摘要**：修复桌面端 `project:initialize` 只创建 `output/` 目录，未同步生成 `Agent.md`/`Tool.md` 及 `skills/domain-discovery`、`business-refinement`、`model-review` 的问题。现在桌面端与 Web 初始化语义一致，同时协作运行时补齐 `document-ops` 工具别名，避免 `Tool.md` 声明与实际可调用工具不一致。

## 2026-06-24 — feat：实现 OS.12 系统级 Office 文件读取工具

**类型**：feat
**影响模块**：`packages/core/src/lib/features/document/`、`packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts`、`packages/core/src/lib/integrations/pi-agent/tools/index.ts`、`packages/core/src/lib/features/services/project-initialization-service.ts`、`templates/project-interview/Tool.md`、`skills/agent-creator/`、`skills/role-agent-creator/`
**摘要**：新增系统级文档解析基础层和受工作目录边界保护的 Agent 工具，支持 `read_document`、`read_spreadsheet`、`list_document_structure`、`extract_document_tables`。项目访谈模板、项目初始化内联模板、任务型 Agent 创建模板与 RoleAgent 创建模板同步加入新工具，便于各类 Agent 读取 Word、Excel、CSV 和文本文件。

## 2026-06-24 — docs：新增 OS.12 系统级 Office 文件读取能力 Story

**类型**：docs
**影响模块**：`docs/specs/epic-OS/story-OS.12/README.md`、`docs/specs/epic-OS/README.md`、`docs/index.md`
**摘要**：在 Epic OS 下新增 OS.12 Story，规划系统级 Word / Excel / CSV 文件读取能力。该 Story 将 Office 解析设计为 `packages/core` 基础设施和受控 Agent 工具，明确路径边界、分页读取、DocumentAst / WorkbookAst 中间格式、验收标准与分阶段交付计划。

## 2026-06-23 — fix：首页无项目时仍显示 Agents 和 Skills

**类型**：fix
**影响模块**：`packages/web/src/app/page.tsx`
**摘要**：修复打包态数据目录存在 `data/agents/*/Agent.md`，但 `data/projects` 没有项目 `project.json` 时，首页因为把应用启动器、用户 Agent、自定义技能区块放在 `projects.length > 0` 分支内而全部隐藏的问题。现在项目区块仅在存在项目时显示，应用启动器和用户 Agent/Skill 列表会独立渲染。

## 2026-06-23 — fix：skill outputDir=data 不再重复拼接 data

**类型**：fix
**影响模块**：`packages/core/src/lib/features/skills/service.ts`、`packages/core/src/lib/features/services/launcher/skill.ts`
**摘要**：修复打包态 `getDataRoot()` 已指向 `app.getPath('userData')/data` 时，技能 frontmatter `outputDir: data/` 被解析为 `.../data/data/` 的问题。现在 `data` / `data/` 会直接映射到数据根目录，`data/<subdir>` 会映射到数据根下对应子目录，避免 dock 角色 Agent 创建入口传入错误的 `outputDir`。

## 2026-06-22 — docs：桌面端运行时日志文档

**类型**：docs
**影响模块**：`docs/desktop-runtime-logs.md`、`docs/index.md`
**摘要**：新增桌面端运行时日志文档，包含日志位置、常用查看命令、日志前缀说明、路径架构、数据目录结构和故障排查指南。

## 2026-06-22 — fix：打包后所有工具回退路径改为 getDataRoot()

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/bash-tools.ts`、`coding-tools.ts`、`document-tools.ts`、`url-tools.ts`、`skill-tools.ts`
**摘要**：修复打包后桌面端工具回退路径指向只读的 `process.resourcesPath`（DMG 内）导致文件操作失败的问题。所有工具的 `workingDirectory` 回退链统一改为 `getDataRoot()`（可写数据目录），不再使用 `getMonorepoRoot()`（只读资源目录）。

## 2026-06-22 — fix：打包后 skill 输出目录指向可写的数据目录

**类型**：fix
**影响模块**：`packages/core/src/lib/features/services/launcher/skill.ts`
**摘要**：修复打包后桌面端 skill 的输出目录指向只读的 `process.resourcesPath`（DMG 内）导致文件写入失败的问题。`resolvedOutputDir` 现在直接使用 `getDataRoot()`（`~/Library/Application Support/@originos/desktop/data`），避免 `path.join(getDataRoot(), 'data/')` 产生重复路径 `data/data/`。

## 2026-06-22 — fix：文件工具边界优先使用 skillOutputDir

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/file-tools.ts`、`packages/web/src/components/skills/SkillDialog.tsx`、`skills/role-agent-creator/SKILL.md`
**摘要**：修复 role-agent-creator 等技能创建的 Agent 产物写入 `data/skills/role-agent-creator/agents/` 而非 `data/agents/` 的问题。`resolveInsideBoundary` 现在优先使用 `skillOutputDir` 作为文件工具边界，仅在 `skillOutputDir` 未设置时回退到 `workingDirectory`；同时更新系统提示词和 SKILL.md，明确文件工具路径应相对于 `${OUTPUT_DIR}` 而非工作目录。

## 2026-06-22 — fix：desktop:dev 启动等待条件改为 TCP 端口

**类型**：fix
**影响模块**：`packages/desktop/package.json`、`packages/desktop/src/main/main.ts`
**摘要**：修复开发态桌面端 `desktop:dev` 中 Electron 客户端不启动或启动过早加载失败的问题。脚本原先通过 `wait-on http://localhost:3000` 等待 Next 首页返回 HTTP 成功，但 Next dev 在首页编译或请求悬挂时会导致等待进程一直卡住；现在改为等待 `tcp:3000` 和主进程编译产物存在后启动 Electron，并在主进程开发态加载 renderer 前等待 TCP 端口可连接。

## 2026-06-22 — fix：Anthropic Bearer 凭据不再注入 apiKey

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/server-config.ts`、`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/server-config.test.ts`
**摘要**：修复桌面开发态用户配置使用 `ANTHROPIC_AUTH_TOKEN` 时仍被包装到 `x-api-key` 的问题。运行时模型创建阶段不再把 bearer token 传入 `createAnthropicModel` 的 `apiKey` 选项，Agent 的 stream wrapper 在 `credentialAuthMode=bearer/oauth` 时使用现有 Bearer transport 发送 `Authorization: Bearer`，避免 `pi-ai` Anthropic 分支从配置回退生成错误的 `x-api-key`。

## 2026-06-17 — fix：桌面端 LLM 日志单独落盘

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`
**摘要**：为 Electron 桌面主进程新增 LLM 日志镜像写入。保留原有终端输出不变，同时将 `[LLM]`、`[createRuntimeModel]`、`[createOriginOSAgent]`、`[OriginOSAgent]`、`[streamFn]`、`[anthropic stream]`、`[AgentLoop]`、`[renderer]` 等模型调用相关日志追加写入 `app.getPath('logs')/llm.log`，便于打包后排查大模型请求与流式响应问题。

## 2026-06-17 — fix：pi-mono 子包改为 workspace 依赖

**类型**：fix
**影响模块**：`pnpm-workspace.yaml`、`package.json`、`packages/web/package.json`、`packages/desktop/package.json`、`packages/agent/package.json`
**摘要**：将 `pi-mono/packages/*` 纳入 pnpm workspace，并把 `@mariozechner/pi-ai`、`@mariozechner/pi-agent-core` 从 `file:` 本地链接切换为 `workspace:*`。这样打包阶段会按真实包名参与依赖解析，避免 Electron 安装包因本地 file link 生成异常目录结构而丢失运行时模块。

## 2026-06-16 — fix：桌面打包补齐 Pi Agent 兼容模块名

**类型**：fix
**影响模块**：`packages/agent/`、`package.json`、`packages/web/package.json`、`packages/desktop/package.json`
**摘要**：修复打包后桌面端运行时找不到 `@mariozechner/agent` 的问题。新增 workspace 兼容包 `@mariozechner/agent`，内部转发到真实发布名 `@mariozechner/pi-agent-core`，并将根应用、Web 与 Desktop 的依赖切到该兼容包，避免 file dependency 因包名不一致导致 app.asar 缺模块。

## 2026-06-16 — fix：打包态桌面端自启本地 renderer

**类型**：fix
**影响模块**：`packages/web/next.config.mjs`、`packages/desktop/electron-builder.yml`、`electron-builder.yml`、`packages/desktop/src/main/main.ts`、`packages/desktop/package.json`
**摘要**：为 Electron 打包态补齐完整 renderer 启动链路。Web 构建切换为 Next `standalone` 输出，打包时将 standalone server、静态资源与 public 一并带入安装包；桌面主进程在 packaged 模式下自动启动本地 renderer server，并在可用后加载 `http://127.0.0.1:{port}`，不再依赖外部 `ELECTRON_RENDERER_URL`。离线打包场景下，Electron Builder 改为通过 `electronDist` 显式复用本地 `electron/dist`，避免访问 GitHub 下载 Electron；mac 打包目标同时收敛为 `arm64`，匹配当前本机已有缓存。

## 2026-06-16 — fix：打包态桌面数据目录切换到 userData

**类型**：fix
**影响模块**：`packages/core/src/lib/paths.ts`、`packages/desktop/src/main/paths.ts`
**摘要**：调整 Electron 打包态默认数据根目录。未显式设置 `DATA_ROOT` 时，开发态仍使用仓库根 `data/`，打包态桌面主进程改为使用 `app.getPath('userData')/data`，避免客户端运行时继续写回源码目录，并保留 `DATA_ROOT` 作为最高优先级覆盖。

## 2026-06-16 — fix：Project Agent 兼容 Memory.md 与 MEMORY.md

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/project-agent/project-context.ts`、`src/lib/integrations/pi-agent/project-agent/project-context.ts`、`packages/core/src/lib/integrations/pi-agent/project-agent/__tests__/collaboration-prompt.test.ts`
**摘要**：修复 Project Agent 启动时只读取 `MEMORY.md`，导致 Memory Core 写入的 `Memory.md` 快照无法注入 prompt 的问题。项目上下文现在优先读取 `Memory.md`，并兼容回退到历史文件名 `MEMORY.md`。

## 2026-06-16 — fix：首页无边框，子窗体恢复原生边框

**类型**：fix
**影响模块**：`packages/desktop/src/main/window-manager.ts`
**摘要**：调整桌面端窗体策略：首页主窗体继续保留无边框样式，后续通过 `ElectronWindowManager` 创建的业务子窗体恢复系统原生边框与标题栏，避免所有窗体都走无边框交互。

## 2026-06-16 — fix：无边框窗体补齐拖拽区

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`、`packages/desktop/src/main/window-manager.ts`、`packages/web/src/styles/globals.css`、`packages/web/src/components/{skills/SkillDialog.tsx,interview/InterviewWindow.tsx,os/workspace/WorkspaceWindow.tsx,os/workspace/ProjectWorkspace.tsx,os/agent-dialog/AgentDialogContent.tsx,solution/SolutionDesign.tsx}`
**摘要**：保留 macOS 桌面端无边框/隐藏顶栏样式，并为原生窗体页面顶部补齐 Electron 拖拽区域。统一新增 `native-drag-region` / `native-no-drag`，让标题区可拖拽、按钮和标签页继续可点击，修复无边框窗体无法拖动的问题。

## 2026-06-16 — fix：恢复桌面窗体原生顶栏

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`、`packages/desktop/src/main/window-manager.ts`
**摘要**：修复 macOS 桌面端主窗体与业务子窗体顶部原生顶栏消失的问题。普通 BrowserWindow 的 `titleBarStyle` 恢复为 `default`，保留透明背景与 vibrancy 设置，但不再隐藏系统标题栏。

## 2026-06-16 — fix：Anthropic Bearer 认证头映射

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/server-config.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/server-config.test.ts`
**摘要**：修复运行时 Anthropic `anthropicAuthToken` 仍被写入 `apiKey` 字段的问题。Bearer/OAuth 凭据现在会落到 `authToken`，并清空 `apiKey`，确保底层 Anthropic SDK 发送 `Authorization: Bearer` 而不是 `x-api-key`，避免自定义路由返回 401。

## 2026-06-16 — feat：桌面端全局热键唤起 Spotlight

**类型**：feat
**影响模块**：`packages/desktop/src/main/shortcuts.ts`、`packages/desktop/src/main/main.ts`、`packages/web/src/app/page.tsx`、`packages/web/src/store/spotlightStore.ts`、`packages/core/src/types/spotlight.ts`
**摘要**：桌面端新增全局 Spotlight 热键链路，支持 `Cmd/Ctrl+K` 直接唤起聚焦搜索，并保留 `Cmd/Ctrl+Shift+O` 作为兼容入口。主进程通过统一的 `toggle-spotlight` 事件唤起前端 Spotlight，前端 Spotlight store 新增切换语义，避免重复唤起时只能打开不能关闭。

## 2026-06-15 — fix：Anthropic 运行时凭据按字段来源映射

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/llm-config.ts`、`packages/core/src/lib/integrations/pi-agent/server-config.ts`、`packages/web/src/store/settingsStore.ts`、`pi-mono/packages/ai/src/types.ts`、`pi-mono/packages/ai/src/providers/anthropic.ts`
**摘要**：修复多 agent / runtime 场景下 Anthropic 凭据误判问题。运行时配置现在按 `anthropicAuthToken` 与 `anthropicApiKey` 的字段来源保留映射，不再根据 token 值推断；Anthropic provider 改为优先读取显式的凭据来源元数据，再决定使用 Bearer 还是 API key 认证，避免 `tp-...` 这类兼容 token 被错误当成普通 API key 发送。

## 2026-06-15 — fix：AI 解决方案窗体消息展示不全

**类型**：fix
**影响模块**：`packages/web/src/components/solution/SolutionDesign.tsx`、`packages/web/src/components/interview/CUIDialogPanel.tsx`、`packages/web/src/components/ui/chat/ChatMessageList.tsx`、`packages/web/src/components/ui/chat-message.tsx`
**摘要**：修复 AI 解决方案窗体内长消息被外层布局裁切的问题。为解决方案对话的嵌套 flex 容器补齐 `min-h-0`/`min-w-0`，让消息列表正确占用剩余高度并滚动；同时限制 Markdown、代码块和表格在气泡内换行或横向滚动，避免撑破消息区域。

---

## 2026-06-15 — fix：Agent 窗体实时消息缺失

**类型**：fix
**影响模块**：`packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`、`packages/web/src/app/api/agent/projects/[projectId]/messages/route.ts`、`packages/core/src/modules/collaboration-runtime/facade/event-bus.ts`、`packages/core/src/modules/collaboration-runtime/ui/store.ts`
**摘要**：修复 AI 解决方案和项目 Agent runtime SSE 只在最终任务完成后才向窗体发送总结的问题，`ASSISTANT_MESSAGE` 现在会立即推送到窗体。多 Agent 协作实时事件总线不再丢弃 `MESSAGE_SENT`，UI store 将 supervisor 流式片段合并为同一条气泡，并在最终 `ASSISTANT_MESSAGE` 到达时校准为完整答案；文件事件存储仍继续过滤 token 碎片，避免 JSONL 膨胀。

---

## 2026-06-15 — fix：桌面原生窗体半透明底色

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`, `packages/desktop/src/main/window-manager.ts`, `packages/web/src/app/window/page.tsx`, `packages/web/src/styles/globals.css`
**摘要**：桌面端 BrowserWindow 保留默认原生标题栏，macOS 下通过原生 `vibrancy`/`visualEffectState` 提供系统级透明材质；原生窗体 `/window` 页面改为透明承载层，不再用 Web CSS 模拟毛玻璃，避免透明度落在网页内部。

---

## 2026-06-15 — fix：桌面窗体流式输出重复帧去重

**类型**：fix
**影响模块**：`packages/core/package.json`, `packages/core/src/lib/integrations/pi-agent/stream-dedupe.ts`, `packages/core/src/lib/integrations/pi-agent/client-hooks.ts`, `packages/core/src/lib/integrations/pi-agent/use-persistent-agent.ts`, `packages/desktop/src/main/services/agent-session-service.ts`, `packages/desktop/src/main/services/agent-project-service.ts`, `packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`, `packages/web/src/app/api/agent/projects/[projectId]/messages/route.ts`
**摘要**：新增流式文本合并工具，统一处理 `text_delta` 重复帧、完整内容重发帧和最终 `assistant_message` 校准帧。桌面主进程 IPC 转发、窗体 Hook 与 Web SSE 路由均只追加有效新增后缀，避免窗体内流式输出内容重复。

---

## 2026-06-14 — fix：项目窗体 Agent shutdown 时序 + 上下文丢失

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/persistent-agent.ts`
**摘要**：修复项目窗体（PersistentAgent）两个关联问题：
1. shutdown 时清空 defaultContext 导致 in-flight 工具调用报 `Tool boundary not configured`，现改为不清空 defaultContext
2. shutdown 直接 destroy agent 中断流式输出，现改为先等待 in-flight 消息处理完成（最多 10 秒）再 destroy

---

## 2026-06-14 — refactor：按 Agent 层级清理工具集 + 本体工具描述分层

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/system-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/ontology-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/ontology-data-tools.ts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：按 Agent 层级清理工具注册，移除无用工具并限制 skill 类型 Agent 的工具边界：
- 移除 `calculate`、`get_system_info`、`get_help` 系统工具（无实际用途）
- 本体创建工具（`create_domain`、`create_concept`）添加 `scopes` 声明，排除 `skill` 类型 Agent
- `agent-worker.mts` 使用 `getAgentToolsForScope(agentType)` 替代 `getAgentTools()` + 手动过滤
- 本体工具描述明确分层：结构层工具标注【本体结构层】，实例数据层工具标注【本体实例层】，避免 Agent 混淆 schema 定义与实际数据

---

## 2026-06-14 — refactor：多 Agent 消息链路重构（性能 + 可维护性）

**类型**：refactor
**影响模块**：`packages/core/src/modules/collaboration-runtime/ui/store.ts`, `packages/core/src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx`, `packages/core/src/modules/collaboration-runtime/ui/use-sse.ts`, `packages/core/src/modules/collaboration-runtime/session/fs-event-store.ts`, `packages/core/src/modules/collaboration-runtime/facade/dag-runner.ts`, `packages/core/src/modules/collaboration-runtime/facade/event-bus.ts`, `packages/desktop/src/main/services/collaboration-service.ts`
**摘要**：多 Agent 协作运行时消息链路结构性重构，解决会话时长增长时的性能劣化问题：
- **Store 增量维护**：`foregroundMessages`/`displayMessages` 在 `addEvent` 时增量更新（O(1)），移除组件层全量 `useMemo` 重算
- **events[] 容量控制**：原始事件数组上限 2000 条，超出时移除最旧条目，不影响增量显示状态
- **recentlyActiveAgents 修复**：用 `Map<agentId, expireAt>` + 单一 500ms interval 替代每事件一个 `setTimeout`
- **FsEventStore 写入串行化**：per-session Promise chain 写入队列，消除多 worker 并发写入竞争
- **MESSAGE_SENT 过滤**：`append()` 和 `read()` 均过滤流式 token 碎片，减少 JSONL 膨胀
- **事件缓冲 + 预连接**：`use-sse.ts` 增加事件缓冲区（30s TTL）和 `preconnect()` 函数，消除 React 渲染与事件到达的竞态
- **事件转发同步化**：`event-bus.ts` 通过 `addElectronForwarder` globalThis hook 替代异步 monkey-patch，保证事件转发零延迟
- **欢迎事件持久化**：`dag-runner.ts` 欢迎事件 `await store.append()` 确保持久化后再 emit

---

## 2026-06-14 — fix：桌面端流式消息渲染竞态 + 多 Agent 窗体事件转发

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/client-hooks.ts`, `packages/core/src/lib/integrations/electron/services/agent-session.ts`, `packages/desktop/src/main/services/agent-session-service.ts`
**摘要**：修复桌面端流式消息非流式显示（一次性刷出）的竞态问题：
- `subscribeAgentEvents` 必须在 `sendAgentMessageStream` 之前调用，避免 text_delta 事件丢失
- `sendToRenderer` 增加 `sessionId` 字段，`subscribeAgentEvents` 支持按 sessionId 过滤

---

## 2026-06-14 — fix：Tool boundary not configured + 用户 LLM 配置统一

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/bind-session.ts`（新建）, `packages/core/src/lib/integrations/pi-agent/agent-manager.ts`, `packages/core/src/lib/integrations/pi-agent/persistent-agent.ts`, `packages/core/src/lib/features/user-config/index.ts`（新建）, `packages/core/src/lib/integrations/pi-agent/config.ts`, `packages/desktop/src/main/services/misc-service.ts`, `packages/web/src/app/api/user-config/route.ts`, `packages/web/src/store/settingsStore.ts`
**摘要**：
- 新增 `bindToolsToSession` 共享工具函数，为每次会话绑定独立的 tool context，修复项目窗体 "Tool boundary not configured" 错误
- 新增 `data/user-config.json` 持久化用户 LLM 配置，desktop 和 web 共享同一配置文件
- `getEnvConfig()` Node.js 分支优先读取用户配置文件覆盖环境变量

---

## 2026-06-14 — fix：桌面端 IPC 热重载守卫

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`
**摘要**：添加 `globalThis.__ipcHandlersRegistered` 守卫，防止 Electron 热重载时重复注册 IPC handler 导致 "Attempted to register a second handler" 错误

---

## 2026-06-12 — feat：Story 10.9 IPC 服务化迁移 Phase 2 领域覆盖

**类型**：feat
**影响模块**：`packages/core/src/lib/integrations/electron/ipc-protocol.ts`, `packages/core/src/lib/integrations/electron/services/`, `packages/core/src/lib/features/sandbox/app-scanner.ts`, `packages/core/src/lib/features/user-registry/index.ts`, `packages/desktop/src/main/services/`, `packages/desktop/src/main/main.ts`, `packages/desktop/src/main/ipc-protocol.ts`
**摘要**：完成 Story 10.9 Phase 2 多领域 IPC 服务化迁移：
- **10.9.4 Project**：ProjectService + project adapter（list/get/create/update/delete）
- **10.9.5 Ontology**：OntologyService（entity CRUD）+ OntologyDataService（domain/concept/instance）+ 对应 adapters
- **10.9.6 Collaboration/SSE**：CollaborationService（topology/session CRUD/execute/abort/message/blackboard）+ event forwarding via `webContents.send` + collaboration adapter with `subscribeCollaborationEvents`
- **10.9.8 User Registry**：UserRegistryService + user-registry adapter，业务逻辑从 route.ts 抽取到 `@originos/core/lib/features/user-registry`
- **10.9.9 Misc 扩展**：Taste Detection（start/message/analyze/draft）+ Sandbox app list + `listSandboxApps` 业务逻辑抽取到 core
- **10.9.2 Agent Session**：AgentSessionService（session CRUD/destroy/statistics/summary/memory-consolidate）+ agent-session adapter
- **10.9.1/10.9.7 Workspace/Files**：WorkspaceService（resolve/file list/read/write/delete）+ workspace adapter
- 所有 IPC handler 共享 `@originos/core` 业务函数，route.ts 保留为 Web 模式薄壳

---

## 2026-06-12 — feat：Story 10.9 IPC 服务化迁移 Phase 1 样板

**类型**：feat
**影响模块**：`packages/core/src/lib/integrations/electron/`, `packages/core/src/lib/integrations/pi-agent/skill-evolution.ts`, `packages/desktop/src/main/services/`, `packages/web/src/app/api/agent/skill-evolution/route.ts`, `packages/web/src/components/skills/SkillDialog.tsx`, `docs/specs/epic-10/`
**摘要**：启动 Story 10.9 的服务化迁移，完成 Skill list/content/refresh/session history/execution start-complete-timeline/non-streaming-message/evolution 的端到端 IPC 样板：业务入口收敛到 core，HTTP route 与 Electron IPC handler 共享同一 handler，Renderer 调用点改用统一 adapter，Web 模式保留 HTTP fallback；execution message 的 SSE stream 迁移留待后续。

---

## 2026-06-12 — fix：桌面端非 frameless 窗体顶部空白修复

**类型**：fix
**影响模块**：`packages/web/src/app/window/page.tsx`
**摘要**：移除 Electron native window 页面中仅适用于 frameless 窗口的 32px 自定义拖拽区。当前桌面端使用系统标题栏窗口，Electron 已提供原生拖拽能力，页面内额外预留拖拽区会导致窗体内容顶部出现空白。

---

## 2026-06-11 — refactor：Story OS.11 窗体类型注册表 + Dock 左侧位置 + Dock 窗口同步

**类型**：refactor / feat
**影响模块**：`src/services/AppWindowManager.ts`, `src/lib/features/window/`, `src/components/os/dock/`, `src/app/page.tsx`, `src/app/dock/page.tsx`, `packages/desktop/src/main/window-manager.ts`
**摘要**：新增 `WindowTypeRegistry`，用注册表驱动替换 `AppWindowManager` 中的 if-else 窗体类型分发链，消除 solution 被误路由为 workspace 的 bug；Dock 默认位置改为操作系统左侧，支持 hover 弹出；Electron 独立 dock 窗口通过 IPC `dock:sync-apps` channel 与主窗口同步 app 列表；修复 `TopMenuBar` 时钟 SSR hydration mismatch；Interview 调用方 `entryType` 从 `'project'` 修正为 `'interview'`。

---

## 2026-06-05 — feat：Story 10.7 Monorepo 骨架搭建

**类型**：feat
**影响模块**：`packages/core/`, `packages/web/`, `packages/desktop/`, `packages/service/`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `turbo.json`
**摘要**：搭建 monorepo 骨架，新增 4 个包（@originos/core, @originos/web, @originos/desktop, @originos/service），更新 pnpm workspace 识别 packages/*，提取共享 tsconfig.base.json，新增 turbo.json 构建配置。现有 src/ 代码不动，packages/ 为后续逐步迁移预留位置。

---

## 2026-06-03 — feat：Epic 10 启动实施，搭建 Electron 基础骨架

**类型**：feat
**影响模块**：`package.json`, `tsconfig.json`, `tsconfig.electron.json`, `electron/main.ts`, `electron/preload.ts`, `src/lib/integrations/electron/env.ts`, `src/types/electron.d.ts`
**摘要**：开始实施 Epic 10，新增 Electron 主进程与 preload 入口、Renderer 环境检测抽象、独立 Electron TypeScript 构建配置，以及桌面开发/打包脚本定义。当前阶段保持浏览器版本路径不变，为后续原生窗口、IPC 文件系统与本地 Agent Runtime 适配提供基础壳层。

## 2026-06-03 — feat：Epic 10 原生窗口 IPC 与 Renderer 适配首版

**类型**：feat
**影响模块**：`electron/main.ts`, `electron/ipc-protocol.ts`, `electron/window-manager.ts`, `src/lib/integrations/electron/ipc-protocol.ts`, `src/lib/integrations/electron/window.ts`, `src/hooks/useElectronWindow.ts`, `src/hooks/useAppWindowManager.ts`, `src/hooks/useAppWindow.ts`, `src/components/os/window/AppWindowContainer.tsx`, `src/types/app-window.ts`
**摘要**：补齐 Electron 原生窗口管理首版实现，新增 Main Process `BrowserWindow` IPC 协议和 Renderer 侧窗口 API，并在现有 `useAppWindowManager` / `useAppWindow` 边界引入 Electron 分流。当前仅在显式 `metadata.renderMode='native'` 且内容可序列化时启用原生窗口，同时在页面内跳过重复渲染对应 CSS 窗体，保留浏览器 fallback 作为默认路径。

## 2026-06-03 — feat：Epic 10 本地文件系统直连首版

**类型**：feat
**影响模块**：`electron/main.ts`, `electron/ipc-protocol.ts`, `electron/local-fs.ts`, `src/lib/integrations/electron/ipc-protocol.ts`, `src/hooks/useLocalFS.ts`, `src/lib/hooks/use-workspace.ts`
**摘要**：为 Electron 模式新增本地文件系统 IPC 适配，支持 workspace 目录的文件读取、写入、列目录与删除，Renderer 侧通过 `useLocalFS` 直接访问 Main Process 文件能力。`use-workspace` 已增加 Electron 分支，浏览器模式继续走现有 `/api/workspace/files` 路由，保持双版本并行。

## 2026-06-03 — fix：Epic 10 workspace 文件监听与递归列目录补齐

**类型**：fix
**影响模块**：`electron/local-fs.ts`, `src/components/os/workspace/WorkspaceWindow.tsx`, `src/hooks/__tests__/useLocalFS.test.ts`
**摘要**：将 Electron 本地文件系统的列目录行为补齐为递归扫描，和现有 workspace HTTP API 保持一致。同时为 `WorkspaceWindow` 接入本地文件变更监听，在 Electron 模式下外部修改工作区文件后自动刷新文件树，并在当前打开文件命中变更时重新加载内容。

## 2026-06-03 — feat：Epic 10 本地 Agent Runtime 桥接首版

**类型**：feat
**影响模块**：`electron/main.ts`, `electron/ipc-protocol.ts`, `electron/local-agent-bridge.ts`, `src/lib/integrations/electron/ipc-protocol.ts`, `src/lib/integrations/electron/local-agent.ts`, `src/hooks/useLocalAgent.ts`, `src/lib/integrations/pi-agent/use-pi-agent-session.ts`, `src/hooks/__tests__/useLocalAgent.test.ts`
**摘要**：新增 Electron Main Process 本地 Agent 子进程桥接，基于 `agent-worker.mts` 管理本地 Agent 的启动、消息发送、中止和事件转发。Renderer 侧新增 `useLocalAgent` 和本地 runtime 客户端 API，并让 `usePiAgent` 在 Electron 环境下优先走本地 Agent Runtime，浏览器模式保持原有 HTTP/SSE 会话链路不变。

## 2026-06-03 — feat：Epic 10 托盘与全局快捷键首版

**类型**：feat
**影响模块**：`electron/main.ts`, `electron/tray-manager.ts`, `electron/shortcuts.ts`, `src/app/page.tsx`
**摘要**：新增 Electron 托盘管理器与全局快捷键管理器，支持托盘菜单、快速启动、最近项目入口以及 `Cmd/Ctrl+Shift+O` 快捷键。首页已接入 `show-quick-launcher` 和 `open-project` 事件，在 Electron 模式下可直接唤起 Spotlight 或打开指定项目工作区。

## 2026-06-03 — feat：Epic 10 打包分发与自动更新骨架

**类型**：feat
**影响模块**：`electron/main.ts`, `electron/auto-updater.ts`, `electron-builder.yml`, `package.json`, `resources/icons/README.md`
**摘要**：新增 Electron 自动更新管理器骨架和独立 `electron-builder.yml` 分发配置，主进程在打包态可安全初始化更新检查。当前对 `electron-updater` 和 `electron-log` 采用可选动态加载，依赖未安装时会自动降级，不影响开发模式和现有 Electron 基础链路。

## 2026-05-29 — feat：首页桌面化视觉升级

**类型**：feat
**影响模块**：`src/app/page.tsx`, `src/components/framework/AppCard.tsx`
**摘要**：将首页从普通卡片式门户重构为更接近操作系统桌面的总览界面，新增桌面背景层、系统侧边状态面板、工作区摘要卡和更强的半透明面板层次；同时统一应用卡片为玻璃化窗口风格，使首页与 Dock、Spotlight、窗口系统的视觉语言更一致。

## 2026-05-26 — fix：Agent 认知歧义 — OriginOS 项目 ID 与本体「项目」概念区分

**类型**：fix
**影响模块**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：在协作 Agent system prompt 的"业务项目 ID"注入点（两处：Supervisor 路径约第 725 行、Worker 路径约第 1070 行）紧跟追加一行 ⚠️ 歧义说明，明确"业务项目 ID（proj-xxx）是 OriginOS 工作区容器标识符，与本体中用户自定义的'项目'概念实例（业务实体）完全不同，ontologyId 应使用 ontology-{业务项目ID} 格式"，防止 Agent 在操作本体数据时将系统 projectId 与用户业务概念混淆。

本文件记录每次需求变更的摘要，格式遵循 AGENTS.md 变更管理规约。

---

## 2026-05-26 — feat：本体实例关系集成（Story 8.5）

**类型**：feat
**影响模块**：`src/lib/features/ontology-data-store/types.ts`, `src/lib/features/ontology-data-store/schema-validator.ts`, `src/lib/integrations/pi-agent/tools/ontology-data-tools.ts`, `docs/specs/epic-8/story-8.5/`
**摘要**：ConceptField 新增 `relation` 类型；`loadConceptSchema` 自动将本体中的 ConceptRelation 注入为 relation 字段；`create_instance` 工具识别 fields 中的 relation 字段并自动建立实例关系；`query_instances` 结果每个 item 附带 `relations[]`，无需单独调用关系工具。

## 2026-05-26 — fix：本体实例图谱支持概念筛选与框选批量删除

**类型**：fix
**影响模块**：`src/components/os/workspace/DataTabView.tsx`, `src/components/os/data-editor/OntologyGraphView.tsx`
**摘要**：为本体窗体实例图谱增加按概念过滤视图，减少多概念场景下的浏览噪音。同时接入 React Flow 框选/多选能力，并提供批量删除已选实例的操作入口。

## 2026-05-26 — fix：协作查看窗体样式收敛并隐藏 Supervisor 节点

**类型**：fix
**影响模块**：`src/modules/collaboration-runtime/ui/CollaborationViewer.tsx`
**摘要**：将多 Agent 协作查看器的外层容器、标题栏、分栏区和卡片样式收敛到现有窗体一致的浅色半透明风格，减少与 Workspace/Sandbox 等窗口的视觉割裂。同时在 Agent 活动列表中过滤 `supervisor`，避免其继续作为普通协作节点显示。

## 2026-05-21 — fix：Worker Agent HITL 恢复链路修复

**类型**：fix
**影响模块**：
- `src/modules/collaboration-runtime/sandbox/agent-worker.mts` — HITL-aware `ask_user_question` + `respondToHumanReview` HMR 修复
- `src/lib/collaboration-runtime-service/index.ts` — `respondToHumanReview` 持久化加载

**摘要**：
- **HITL 恢复链路简化**：`respondToHumanReview` 不再依赖 `activeResumes` Map（HMR 后丢失），改为直接通过 `getGlobalSpawner().get(agentId)` 查找运行中的 worker 进程，调用 `proc.resume(response)` 直接发送用户回复。
- **Worker Agent 暂停机制**：覆盖默认的 `ask_user_question` 工具，协作用户确认场景下触发 `HUMAN_REVIEW_REQUEST` 事件 → `waitForHumanResponse()` 暂停执行 → 等待用户通过 `/human-review` 端点回复 → `AgentProcess.resume()` 恢复执行。
- **HMR 会话持久化**：`respondToHumanReview` 增加 `await loadPersistedSessions()`，避免 HMR 后内存 Map 清空导致 "Session not found"。

---

## 2026-05-21 — fix/feat：Story 9.29 Supervisor 协调能力修复 + Story 9.30 Supervisor Agent 化（SUPA-01/02 partial）

**类型**：fix / feat
**影响模块**：
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` — Verifier 修复（SUP-09）+ SUPERVISOR_* 事件发射（9.30）
- `src/modules/collaboration-runtime/sandbox/agent-worker.mts` — 新增 supervisor agentType + `initializeSupervisorAgent()`
- `src/modules/collaboration-runtime/sandbox/agent-spawner.ts` — `AgentProcessConfig.agentType` 扩展 supervisor
- `src/modules/collaboration-runtime/session/types.ts` — 新增 SUPERVISOR_AGENT_START / SUPERVISOR_DECOMPOSITION / SUPERVISOR_DISPATCH / SUPERVISOR_WORKER_COMPLETE / SUPERVISOR_WORKER_FAILED / SUPERVISOR_AGGREGATE 事件类型
- `data/agents/supervisor/` — 新增 Supervisor Agent 系统模板（Agent.md / Role.md / Tool.md / Taste.md / Memory.md / Knowledge.md / Patterns.md）

**摘要**：
- **9.29 SUP-09**：修复 Verifier 对 read-only 审查角色的误判。LLM prompt 新增规则"有工具调用 ∧ 非纯提问 → passed（即使无写文件）"；回退规则由 `hasWrite && !isQuestioning` 改为 `(hasToolCalls && !isQuestioning) || hasWrite`；`isQuestioning` 判定改为只检查最后一条 assistant 文本且须以"？"结尾，减少误触发。
- **9.30 SUPA-01**：新建 `data/agents/supervisor/` 系统模板，包含 7 个文件，覆盖 Supervisor Agent 的身份（目标分解/派发/监督/验收/汇总）、状态机（decomposing/dispatching/monitoring/verifying/aggregating/escalated）、工具白名单（只读 + 协调工具，禁止写文件/执行命令）。
- **9.30 SUPA-02（partial）**：新增 `agentType: "supervisor"` 支持于 spawner + worker；`agent-worker.mts` 新增 `initializeSupervisorAgent()` 初始化路径（复用 7 层 prompt 构建，过滤只读工具集）；`executeSupervisorDag` 发射 SUPERVISOR_AGENT_START / SUPERVISOR_DECOMPOSITION / SUPERVISOR_AGGREGATE 三个可观测事件。

## 2026-05-21 — docs：新增 Story OS.10（系统工具语义说明加固）

**类型**：docs
**影响模块**：`docs/specs/epic-OS/story-OS.10/README.md`（新增）、`docs/specs/epic-OS/README.md`
**摘要**：盘点 25 个系统工具的 schema 描述完整度，发现本体 10 个工具 + 文件 4 个核心参数全部缺失 description；全部工具未声明返回结构。新建 OS.10 分两个 PR 收敛：PR-A 统一补 `ontologyId` / `domainId` / `filePath` 等关键参数的语义说明（解决 Agent 自造 `design-data-ontology` 这类问题），PR-B 在工具级 description 末尾追加返回结构与易错防御性提示。归 epic-OS 而非 epic-9：属于系统工具基础设施而非协作运行时专项。

## 2026-05-21 — docs：新增 Supervisor Agent 化设计与 Story 9.30

**类型**：docs
**影响模块**：`docs/design/supervisor-agent.md`（新增）、`docs/specs/epic-9/story-9.30/README.md`（新增）、`docs/specs/epic-9/README.md`、`docs/specs/epic-9/story-9.29/README.md`
**摘要**：把 Supervisor 升级为真正 Agent 的目标架构落地为设计文档与 Story 9.30。Supervisor 复用 Worker 的 7 层 prompt + 沙箱子进程结构，新增 `dispatch_worker` / `wait_workers` / `run_verifier` / `bb_*` / `escalate_to_human` 协调工具，删除 `rewriteSubTaskGoal` 与 `SupervisorMode.decompose` stub。9.29 SUP-04 锁定为方案 (b) 改名过渡，治本路径转交 9.30。

## 2026-05-20 — docs：DAG HITL 判定权收敛文档

**类型**：docs
**影响模块**：`docs/design/dag-hitl-decision-standard.md`、`docs/design/multi-agent-runtime.md`、`docs/specs/epic-9/story-9.27/README.md`
**摘要**：新增 [DAG HITL 输入判定标准](../dag-hitl-decision-standard.md) 文档（v1.0），明确 HITL 判定职责归 DAG 层（`multi-agent-executor.ts`），Worker 层只做执行不做业务判定。同步更新 `multi-agent-runtime.md` §5.3 为引用新文档。Story 9.27 README 新增 **ARCH-RT-04d** 债务项：`agent-worker.mts` 中 `sessionHasToolCalls + endsWithQuestion` 判定逻辑需移除，DAG 层需新增 `decideNodeStatus()` 函数。

## 2026-05-20 — fix：HITL pause/resume 链路根本性修复 — handleMessage 不再内部 await resume

**类型**：fix
**影响模块**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：修复多 Agent DAG 中 Human-in-the-Loop 实际不生效的根本 bug。原实现 `handleMessage()` 检测到 `HUMAN_REVIEW_REQUEST` 后在函数内部 `await this.resumePromise`，导致 `case "prompt"` 永远无法执行到 `sendToRuntime({type:"waiting"})`，spawner 的 `pendingCommand` 5 分钟超时，DAG 把等待超时当作错误继续向下执行。修复：`handleMessage` 检测到暂停后立即返回（设置 `resumeContinuation = this.continueAfterResume()`），`case "prompt"` 随即发出 `{type:"waiting"}` 让 spawner 正确解析为 waiting 状态；`case "resume"` 现在 await `worker.waitForResumeContinuation()` 等 agent 完成后再发 `{type:"ready"}`，下游节点可收到真实产出。

 — HITL 验收测试 + 设计文档接线状态标注

**类型**：refactor
**影响模块**：`src/modules/collaboration-runtime/engine/__tests__/dag-executor.test.ts`、`docs/design/multi-agent-runtime.md`、`docs/specs/epic-9/story-9.27/README.md`
**摘要**：完成 Story 9.27 最后三项收尾：(1) 在 `dag-executor.test.ts` 新增 HITL describe block（4 个测试用例），覆盖 `waiting → resume → 下游消费真实产出` 完整链路，验收 ARCH-RT-04a/b/c；(2) 在 `multi-agent-runtime.md` §4.2/§4.2.1/§4.3/§5.4/§6/§12 逐组件添加接线状态标注（Wired / Not-wired Phase 3 保留），完成 ARCH-RT-05 收尾；(3) Story 9.27 全部 7 项验收标准均标记完成，状态升为 ✅ 完成。

## 2026-05-20 — docs：Memory Core 模块架构审查

**类型**：docs
**影响模块**：`docs/design/memory-core.md`、`docs/specs/epic-M/`
**摘要**：基于 AGENTS.md v2.3.0 围栏对 `src/modules/memory-core/`、role-agent 三件套（memory-tracker/dream/consolidator）、cognitive 适配链路、Epic M 文档进行架构审查。识别 4 Critical / 6 High / 5 Medium 共 15 项偏离（ARCH-MC-01..15）：(a) 模块围栏破损（4 处反向 import `@/lib/` — consolidator/adapter/memory-provider/enhanced-pattern-provider），(b) 「语义检索」名实严重不符（ONNX 抛错、`RecallMemory.searchSemantic` 内 `void queryEmbedding`、HNSW `expandSearch` arity 不匹配），(c) 新旧记忆链路双轨并行存在 `Memory.md` 写入冲突（role-agent 走 `MemoryTracker/MemoryBlockManager`，project-agent/persistent/协作 sandbox 走 `MemoryCore`），(d) `MemoryAdapter` 完整实现但 0 引用，(e) Epic M 全 Planning 但代码已上线接线。新增审查报告 `memory-core-architecture-review-2026-05-20.md`；在主设计文档与 Epic M README 顶部插入偏离声明；Epic M 新增 **Story M.8（记忆链路收敛）**、**Story M.9（语义检索能力补齐）** 与 **Story M.10（文档与协作场景对齐）**，三者共同构成 Epic M 的 Governance Phase，作为进入 M.7 前的强制门禁，覆盖 ARCH-MC-01..15 全部 15 项。

## 2026-05-20 — refactor：多 Agent 协作运行时架构治理（Story 9.27）

**类型**：refactor
**影响模块**：`src/modules/collaboration-runtime/`, `src/lib/collaboration-runtime-bridge/`, `src/lib/collaboration-runtime-service/`, `src/modules/collaboration-runtime/sandbox/agent-worker.mts`, `CLAUDE.md`, `docs/design/multi-agent-runtime.md`, `docs/design/multi-agent-runtime-architecture-review-2026-05-20.md`, `.eslintrc.json`
**摘要**：完成多 Agent 协作运行时首轮架构治理。将模块内 `bridge/` 重命名为 `integrations/`，把 Agent 解析器改为由 service 层注入，补齐 HITL waiting/resume 链路，接入 Blackboard 输入/输出写入、最简 notify 分发与 CostController/ConflictDetector 接线，并为 `agents.json` 加入 zod schema 校验。同步统一协作会话存储路径文档与术语表，更新架构审查报告状态。

## 2026-05-20 — docs：多 Agent 协作运行时架构审查

**类型**：docs
**影响模块**：`docs/design/multi-agent-runtime.md`、`docs/design/multi-agent-prompt-architecture.md`、`docs/specs/epic-9/`
**摘要**：基于 AGENTS.md v2.3.0 围栏对 `src/modules/collaboration-runtime/`、`src/lib/collaboration-runtime-{service,bridge}/`、`src/lib/integrations/pi-agent/project-agent/` 与 Epic 9 进行架构审查，识别 4 Critical / 5 High / 4 Medium 共 13 项偏离（ARCH-RT-01..13）：模块围栏破损（`bridge/agent-registry.ts` 直接 import `@/lib/`）、DI 接口空壳化、HITL pause/resume 三处 bug、ConflictDetector/Supervisor/CostController 等大量已实现组件未在生产路径接线、Blackboard 在 Workflow 路径未真正运转、System 模式无独立执行器、`buildCollaborationPrompt` 未在 worker 初始化接线、bridge 层 38 处 any。新增审查报告 `multi-agent-runtime-architecture-review-2026-05-20.md`；在主设计文档 §5 §8 §15 插入接线状态与偏离声明；Epic 9 新增 Story 9.27（架构治理与 HITL 链路修复）作为 Phase 3 高级特性的强制门禁。

## 2026-05-20 — fix：协作工作台切换为 graph-first + Agent CUI 抽屉

**类型**：fix
**影响模块**：
- `src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx` — 默认仅展示协作图，运行后点击 Agent 打开输出/CUI 抽屉
- `src/modules/collaboration-runtime/ui/TopologyGraph.tsx` — 协作图节点简化为仅展示 Agent 信息

**摘要**：将多 Agent 协作工作台从“左图右侧常驻查看器”改为 graph-first 交互。用户初次进入时只看到协作图；工作流启动后，点击运行中的 Agent 节点可查看该 Agent 的输出；若 Agent 进入 `waiting`（Human Review）状态，则同一抽屉内开放 CUI 输入框，允许直接回复并继续执行。同步移除左侧无关统计信息，强化协作图主视角。

---

## 2026-05-20 — fix：协作拓扑图恢复 loop/back-edge 可视化

**类型**：fix
**影响模块**：
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` — 拓扑查看链路保留 loop/back-edge，循环依赖边降级为 `notify` 而非直接删除
- `src/modules/collaboration-runtime/ui/TopologyGraph.tsx` — 分层布局忽略 `notify` 回边，避免 loop 可视化后前端卡死

**摘要**：修复 `/api/collaboration/topology` 在加载拓扑时为避免循环检测而直接移除环路边的问题，导致前端拓扑图无法体现真实的 loop/back-edge 协作关系。现改为仅对会形成 DAG 环的 `trigger/depend` 边做查看态降级，保留为 `notify` 输出给 UI，既避免 `parseTopology()` 抛出循环错误，也恢复拓扑图中的回路可视化。同时修复 `TopologyGraph` 分层布局仍按全量边遍历的问题，避免 `notify` 回边参与 BFS 导致前端队列无限入队、页面卡顿。

## 2026-05-19 — feat：Story 9.26 多 Agent 协作 Prompt 构建 — Data.md + Process.md 注入

**类型**：feat
**影响模块**：
- `src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts` — NEW — 多 Agent 协作上下文加载（Agent.md + Data.md + Process.md + Tool.md + Taste.md + Memory.md）
- `src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts` — NEW — 协作 Agent 7 层 prompt 构建（Identity → DataContract → ProcessFlow → CollaborationProtocol → Toolbox → Style → Permissions）
- `src/modules/collaboration-runtime/sandbox/agent-worker.mts` — MODIFY — 新增 `initializeProjectAgent()` 入口 + `initialize()` 分发逻辑
- `src/lib/integrations/pi-agent/project-agent/index.ts` — MODIFY — 导出新模块

**摘要**：实现 Story 9.26，解决多 Agent 协作场景中 Agent Worker 初始化时缺失 Data.md 和 Process.md 的问题。新建独立的 `initializeProjectAgent()` 初始化入口（不修改现有 `initializeOriginOSAgent()`），通过检测 Data.md + Process.md 是否同时存在来分发到协作路径或单 Agent 路径。协作 Agent 获得完整的 7 层 system prompt，包含数据契约、处理流程、协作协议和"禁止臆造数据"强制指令。`initializeOriginOSAgent()` 和 `initializePersistentAgent()` 原有行为完全不变。

---

## 2026-05-19 — fix：DAG 执行关键缺陷 — workingDirectory 路径修复 + 上游产出传递 + 完整工具注入

**类型**：fix
**影响模块**：
- `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` — workingDirectory + prompt 构建 + 上游产出缓存
- `src/modules/collaboration-runtime/sandbox/agent-worker.mts` — getAgentTools() 完整工具注入
- `docs/specs/epic-9/README.md` — 变更历史更新

**摘要**：修复多 Agent DAG 执行的三个关键缺陷：(1) workingDirectory 路径多了 `data/` 段（`data/projects/{id}/data/agents/{agentId}/` → `data/projects/{id}/agents/{agentId}/`），导致 Agent.md/Tool.md 等配置文件加载失败；(2) Agent 仅接收 `globalGoal`，不知道上游产出——新增 `buildAgentPrompt()` 函数，将上游 Agent 完成结果注入下游 prompt；(3) 工具注入改为 `getAgentTools()` 完整工具集（不做 scope 过滤），确保所有 agent 获得文件、bash、ontology 等完整底层工具。

---

## 2026-05-19 — refactor：Agent/Skill 架构标准重写 v4.0

**类型**：docs
**影响模块**：
- `docs/design/agent-skill-standard.md` — 从 v3.5 升级为 v4.0

**摘要**：以实现为锚点重写 Agent/Skill 架构标准文档。从 v3.5 的体系逻辑与编写规范升级为 v4.0 的实现锚定架构标准版。新增：7 层 System Prompt 详细构成、RoleAgent vs Project Agent 差异对照、认知系统架构（CognitiveManager + 5 Providers）、三层记忆系统（Memory Blocks / JSONL / Dream）、技能完整生命周期（安装/卸载/执行）、模板与创建流程（templates/project-interview/）、多 Agent 协作运行时概述。删除：过时的旧架构示例。

---

## 2026-05-16 — docs：新增 Epic M Memory Core 记忆核心

**类型**：docs
**影响模块**：
- `docs/specs/epic-M/` — Epic M 规格（6 Stories）
- `docs/design/memory-core.md` — 架构设计
- `docs/index.md` — Epic 索引

**摘要**：新增 Epic M（Memory Core 记忆核心），基于 Letta 记忆架构的 Block/Archival/Recall 三层模型，规划 6 个 Story（M.1-M.6），分 3 个 Phase：Phase 1 Core Memory 基础（Block 抽象 + Memory compile），Phase 2 Archival + Recall 语义增强，Phase 3 Memory Tools API + CognitiveProvider 集成 + 适配器。与 Story 9.20 共享底层 embedding + HNSW 引擎。

---

## 2026-05-16 — feat：Epic 9 Multi-Agent 协作运行时 Phase 1+2 完成

**类型**：feat
**影响模块**：
- `src/modules/collaboration-runtime/` — 协作运行时核心模块
- `src/app/api/collaboration/` — 协作 API 路由
- `AGENTS.md` — v2.3.0 更新架构规约

**摘要**：完成 Epic 9 Phase 1（Stories 9.1-9.12）和 Phase 2（Stories 9.13-9.18）全部 18 个 Story 的实现与测试。实现三层进程隔离架构（Web → Runtime → Agent 子进程）、共享黑板 + 事件溯源、DAG 执行器、Supervisor 模式、ACL 消息协议、Contract Net 招标-投标、冲突检测 + Circuit Breaker、能力匹配、Node.js 沙箱、协作 UI 查看器、完整可观测性（logging/metrics/tracing/cost）。180 个测试通过，零 TS 编译错误。Phase 3（Stories 9.19-9.24）待实施。

**Story 状态变更**：
- 9.1-9.18: 📋 Planning → ✅ Complete（18/18）
- 9.19-9.24: 维持 ⬜ Pending

**文档**：
- [docs/specs/epic-9/](../specs/epic-9/) — Epic 规格
- [docs/design/multi-agent-runtime.md](../design/multi-agent-runtime.md) — 架构设计
- [docs/design/process-isolation.md](../design/process-isolation.md) — 进程隔离

---

## 2026-04-22 — fix：系统内置技能产物目录错误

**类型**：fix
**影响模块**：
- `src/app/api/skills/[name]/content/route.ts`
- `src/app/api/agents/[id]/route.ts`
- `src/app/api/agent/sessions/route.ts`
- `src/components/skills/SkillDialog.tsx`

**摘要**：修复首页内置应用入口启动的 bundled 技能将产物写入 `.claude/skills/` 源目录的问题。现路由规则为：bundled 技能产物写入 `data/skills/{name}/`，Agent 产物写入 `data/agents/{name}/`。外部上下文（RoleAgent/Agent 调用技能）行为不变，继续继承调用方 CWD。

**Story 文档**：[docs/stories/fix-skill-output-dir/](../stories/fix-skill-output-dir/README.md)

---

## 2026-04-22 — feat：Epic P2 AI 解决方案设计剩余开发完成

**类型**：feat
**影响模块**：
- `src/components/solution/SolutionDesign.tsx` — 拓扑图触发修复
- `src/components/solution/SolutionList.tsx` — 新增方案版本列表组件
- `src/app/api/projects/[id]/solutions/route.ts` — 新增方案列表 API
- `src/app/page.tsx` — 清理未使用的 onComplete prop

**摘要**：完成 Epic P2 剩余开发工作。修复 `void fetchManifest` 阻塞拓扑图触发的关键 Bug，新增消息检测逻辑监听 Skill 输出并自动切换到拓扑 Tab；新增方案列表 API 和左侧版本列表 UI，支持 5s 轮询；清理 SolutionDesign 组件中未使用的 `onComplete` prop 及 page.tsx 中的对应调用。

**Story 状态变更**：
- P2.1: 🟡 部分实现 → ✅ 已完成
- P2.3: 🔴 未接通 → ✅ 已完成
- P2.5: 🔴 部分 → ✅ 已完成
- P2.2/P2.4: 状态不变（Skill 已实现，UI 非 MVP 必须）

**文档**：[docs/specs/epic-P2/](../specs/epic-P2/)

---

## 2026-04-22 — feat：Epic P2 AI 解决方案设计需求文档补全

**类型**：docs
**影响模块**：
- `docs/specs/epic-P2/README.md` — Epic 总览
- `docs/specs/epic-P2/story-P2.1/README.md` — 入口与 AI 初始化
- `docs/specs/epic-P2/story-P2.2/README.md` — Agent 规划编辑
- `docs/specs/epic-P2/story-P2.3/README.md` — 协作拓扑可视化
- `docs/specs/epic-P2/story-P2.4/README.md` — 沙盒推演
- `docs/specs/epic-P2/story-P2.5/README.md` — 版本管理与清单
- `docs/index.md` — 补全 Epic OS / Epic C / Epic P2 状态

**摘要**：为 PRD `phase-2-ai-solution-design.md` 补全 Epic P2 与 5 个 Story 文档，梳理已有代码实现状态（类型/组件/Skill/API 已就绪，拓扑图未接通，沙盒无独立面板）。识别关键 Bug：`SolutionDesign.tsx` 中 `fetchManifest`/`onComplete` 被 `void` 废弃导致拓扑 Tab 不触发。同步更新 `docs/index.md`，将过期的 Epic 状态对齐至当前实际。

---

---
## 2026-05-21 — fix：solution-design 创建的技能改为归属 Agent 目录

**类型**：fix
**影响模块**：`skills/solution-design/SKILL.md`、`skills/project-skill-creator/SKILL.md`
**摘要**：调整 solution-design 流程中的工程产物约定，明确先创建 `agents/{agent-id}/`，再在该 Agent 目录下创建 `skills/{skill-code}/SKILL.md`。移除“生成技能写入项目根 `skills/` 目录”的旧约定，避免 Agent 自有技能与项目级技能混放。

---
## 2026-05-21 — fix：解决方案拓扑图连线重叠

**类型**：fix
**影响模块**：`src/components/solution/TopologyGraph.tsx`
**摘要**：调整解决方案窗体中的拓扑图边路由逻辑，按节点侧边端口分组错开连线，并对同一对节点之间的并行边增加独立曲率偏移，减少多条协作线重叠导致的可读性问题。

---
## 2026-05-20 — feat：Story 9.28 Swarm/Supervisor 模式生产接线

**类型**：feat
**影响模块**：`src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`、`src/modules/collaboration-runtime/engine/task-orchestrator.ts`、`src/modules/collaboration-runtime/engine/mode-router.ts`、`src/app/api/collaboration/sessions/[id]/execute/route.ts`、`src/lib/collaboration-runtime-bridge/multi-agent-dag-executor.ts`
**摘要**：将 SupervisorMode、ContractNetProtocol、CapabilityMatcher 等已实现但未接线的组件接入生产执行路径。新增 `executeSupervisorDag()` 和 `executeCollaborationRuntime()` 统一入口，支持 `executionMode: "workflow" | "system"` 双模式运行。`mode-router.ts` 自动识别含 `notify` 回边的拓扑切换到 Supervisor 路径。保留原始 DAG 执行链路（`multi-agent-dag-executor.ts` 从 `multi-agent-executor.ts` 重新导出），避免 stub 替换导致的链路丢失。

---
## 2026-05-21 — docs：新增 Story 9.29 Supervisor 模式协调能力修复

**类型**：docs
**影响模块**：`docs/design/supervisor-mode-architecture-review-2026-05-21.md`、`docs/specs/epic-9/story-9.29/README.md`、`docs/specs/epic-9/README.md`
**摘要**：基于 `proj-1778321075425-gmv0zt4h8`（7 Agent / 9 协作边）的实证日志（2,271 事件 / 21 AGENT_END 全部停在提问态 / 0 工件产出）审查 `executeSupervisorDag` 链路，识别 9 项缺陷（SUP-01~SUP-09）按 P0/P1/P2 分层。新建 Story 9.29 合并修复项，P0 三项（HITL 恢复、globalGoal 任务化转写、Blackboard Artifact 流转）作为下一步最小可用闭环，解除 Story 9.19 Queen-Led 的前置依赖。

## 2026-05-22 — docs：协作运行时单前台 Agent PRD + 5 Story 重分拆

**类型**：docs
**影响模块**：`docs/specs/epic-9/PRD-collaboration-product.md`（新增）、`docs/design/supervisor-agent.md`（v1.1）、`docs/design/multi-agent-runtime.md`（v2.0 提示）、`docs/specs/epic-9/story-9.31~9.35/README.md`（新增）、`docs/specs/epic-9/story-9.29/README.md`（SUP-01 验收同步）、`docs/specs/epic-9/story-9.30/README.md`（PR-B 范围转移）、`docs/specs/epic-9/README.md`（Story 列表）
**摘要**：基于"Worker 不直接面对用户"的产品诉求，将 Supervisor 从"协调器（建议）"升级为协作会话期间用户唯一对话伙伴的强约束。新增 PRD 一份，重分拆 5 个 Story：9.31 单前台契约（Worker 工具白名单收紧 + 拒绝 Worker→User 直连）、9.32 Worker 结构化阻塞契约（`report_block` + `WorkerBlock` 类型）、9.33 Supervisor HITL 决策器（自助/改派/升级/拒绝四路径 + 强制 mergedContext）、9.34 用户回复路由收敛到 Supervisor、9.35 Workflow 模式 Lightweight Supervisor 惰性挂载兜底。9.30 PR-B 范围整体转移，9.29 SUP-01 验收同步收紧。

---
## 2026-05-22 — fix：Story 9.31 单前台 Agent 首轮落地

**类型**：fix
**影响模块**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`、`src/lib/integrations/pi-agent/tools/registry.ts`、`src/lib/integrations/pi-agent/agent-manager.ts`、`src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`、`src/lib/collaboration-runtime-bridge/event-mapper.ts`、`src/lib/collaboration-runtime-service/index.ts`、`src/app/api/collaboration/sessions/[id]/messages/route.ts`、`src/modules/collaboration-runtime/ui/MultiAgentLauncher.tsx`、`src/modules/collaboration-runtime/ui/store.ts`
**摘要**：先按 Story 9.31 收紧多 Agent 协作的前台交互边界。移除 worker 路径上的 `ask_user_question` 注册与 scope 暴露，禁止 Worker 直接面向用户提问；将 Worker 抛出的 `HUMAN_REVIEW_REQUEST` 包装为内部 `WORKER_BLOCK` 事件并从前台 SSE 映射中过滤；新增协作 `/messages` 接口，强制用户消息仅投递给 `supervisor`；协作工作台前台主对话只显示 User ↔ Supervisor，Worker 活动保留在内部区域和节点详情中。

## 2026-05-27 — docs：Pattern 机制重构设计 + Story C.10

**类型**：docs
**影响模块**：docs/design/pattern-on-memory-core.md, docs/specs/epic-C/README.md, docs/specs/epic-C/story-C.10/
**摘要**：基于"Pattern 是上层应用、Memory Core 提供底层能力"的分层原则，输出 Pattern 重构设计文档；Epic C 新增 Story C.10，覆盖 PracticeLogger 协作链路接线、用户纠正信号检测、Positive/Negative 二分入库、Patterns.md 由 archival 重建等改造。

## 2026-05-28 — feat：Story C.10 Pattern 机制重构实施

**类型**：feat
**影响模块**：src/lib/integrations/pi-agent/cognitive/pattern/, src/lib/integrations/pi-agent/persistent-agent.ts, src/lib/integrations/pi-agent/persistent-agent-manager.ts, src/modules/collaboration-runtime/sandbox/agent-worker.mts
**摘要**：新建 cognitive/pattern/ 模块（correction-detector / extractor / renderer / PatternProvider），Pattern 存储统一走 ArchivalMemory（Memory Core），Positive/Negative 由用户纠正信号驱动；协作运行时补注册 PracticeLogger；删除旧 EnhancedPatternProvider 注册，统一出口。24 个单测全部通过。

---
## 2026-06-04 — fix：Electron 托盘图标改为从打包资源目录解析

**类型**：fix
**影响模块**：`electron/tray-manager.ts`、`resources/icons/README.md`
**摘要**：调整托盘图标加载逻辑，开发态继续读取工作区 `resources/icons/`，打包态改为优先从 `process.resourcesPath/resources/icons/` 解析，和 `electron-builder` 的 `extraResources` 输出目录保持一致。同步补充资源目录说明，明确该目录仅用于 Electron 分发图标，前端 SVG 图标仍维持在 `src/styles/icon/`。

---
## 2026-06-04 — feat：Story 10.7 Monorepo 架构重构

**类型**：feat / refactor
**影响模块**：
- 全局目录结构（新增 `packages/` 顶层目录）
- `packages/core/`（共享核心代码）
- `packages/web/`（云版本 Web 应用）
- `packages/desktop/`（CE 桌面版）
- CLAUDE.md 架构规约（v2.6.0）
- `_bmad-output/planning-artifacts/epics.md`（新增 Story 10.7）

**摘要**：
实施 Epic 10 Story 10.7，将项目重构为 monorepo 架构，支持云版本和 CE 版本共享核心代码，同时保持独立部署。使用 pnpm workspace 管理包依赖，packages/core 导出为 @originos/core，packages/web 和 packages/desktop 通过依赖 core 包共享业务逻辑和 UI 组件。更新 CLAUDE.md 架构围栏，新增包级别依赖规则、数据存储隔离规则、monorepo 特定禁止事项。

**架构变更要点**：
- 顶层结构：`packages/core/`, `packages/web/`, `packages/desktop/`
- 包依赖：web → core, desktop → core（单向依赖）
- 数据隔离：`data/web/`, `data/desktop/`, `data/shared/`
- 构建工具：pnpm workspace + Turborepo（可选）
- 版本号：CLAUDE.md v2.5.0 → v2.6.0

---

## 2026-06-04 — fix：ask_user_question 结构化参数改为直接渲染选择器

**类型**：fix
**影响模块**：`src/components/ui/chat-message.tsx`、`src/components/ui/chat/ChatMessageList.tsx`、`src/components/os/agent-dialog/MessageList.tsx`、`src/components/os/agent-dialog/AgentDialogContent.tsx`、`src/lib/integrations/pi-agent/use-pi-agent-session.ts`、`src/lib/integrations/pi-agent/client-hooks.ts`
**摘要**：前端补齐 `ask_user_question` 的结构化事件消费逻辑，优先从 `tool_start.args` 直接渲染选择器 UI，不再依赖工具返回后的 YAML 文本解析。保留 YAML 结果回退分支，并补充 `toolCallId/args/result/isError` 的客户端事件类型与工具执行状态同步，修复选择题未显示或显示滞后的问题。

## 2026-06-12 — feat：Story 10.9 Skill message 流式 IPC 接入

**类型**：feat
**影响模块**：`packages/core/src/lib/features/skills/service.ts`、`packages/core/src/lib/integrations/electron/services/skill.ts`、`packages/desktop/src/main/services/skill-service.ts`、`packages/web/src/app/api/skills/executions/[executionId]/message/route.ts`
**摘要**：将 Skill execution message 的流式业务抽为 transport-agnostic `streamSkillExecutionMessage()`。Web 端继续通过 HTTP SSE 输出，CE/Electron 桌面端新增 `SKILL_EXECUTION_MESSAGE_STREAM` 与 `SKILL_EXECUTION_EVENT` 走 IPC event stream，避免桌面依赖 Next.js SSE。

## 2026-06-13 — feat：Story 10.9 剩余基础服务 IPC 迁移

**类型**：feat / refactor
**影响模块**：`packages/core/src/lib/integrations/electron/services/{workspace,ontology,ontology-data,collaboration,user-registry,misc,project}.ts`、`packages/desktop/src/main/services/{workspace,ontology,ontology-data,collaboration,user-registry,misc,project}-service.ts`、`packages/core/src/lib/features/ontology-data-store/instance-relations.ts`、`packages/core/src/lib/hooks/{use-file-upload,use-projects,use-workspace}.ts`、`packages/core/src/lib/features/{ontology/client,api-clients/interviewApi}.ts`、`packages/web/src/lib/hooks/use-file-upload.ts`、`packages/web/src/components/{taste/UserTasteDetection,project/ProjectCreationWizard}.tsx`、`docs/specs/epic-10/story-10.9/README.md`
**摘要**：继续推进并收口 10.9.5/10.9.6/10.9.8/10.9.9，将 Workspace upload、Ontology/Ontology Data、Collaboration SSE、User Registry、Interview/Notification/Taste/Debug/Launch/Sandbox 及 Project Creation Wizard 接入 Electron IPC adapter，同时保留 Web HTTP fallback。下沉 ontology-data instance relation 文件读写到 core，替换 legacy hooks/client 的直接 Next API 调用，并通过 web type-check 与 desktop build。

## 2026-06-13 — fix：用户 LLM 配置优先于环境变量

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/{llm-config.ts,index.ts,server-config.ts,core/agent.ts,agent-manager.ts,persistent-agent.ts,persistent-agent-manager.ts}`、`packages/core/src/modules/collaboration-runtime/{facade/session-store.ts,facade/dag-runner.ts,engine/supervisor-dag.ts,sandbox/agent-worker.mts,ui/MultiAgentLauncher.tsx}`、`packages/core/src/lib/features/agent/session-service.ts`、`packages/core/src/types/agent.ts`、`packages/desktop/src/main/services/agent-session-service.ts`、`packages/web/src/app/api/agent/sessions/route.ts`、`packages/web/src/components/{solution/SolutionDesign.tsx,interview/InterviewWindow.tsx,skills/SkillDialog.tsx,os/agent-dialog/AgentDialogContent.tsx}`、`packages/web/src/app/window/CollaborationWindow.tsx`
**摘要**：新增统一 `llm-config` 模块和 `createRuntimeModel()`，运行时用户 LLM 配置改为显式创建模型，不再通过写入 `process.env` 间接影响 `createAutoModel()`。桌面端复用已有 session 或已运行 Project Agent 时会覆盖旧 `llmConfig` 并热更新模型；AI 解决方案、多 Agent 协作、访谈、Skill/Agent Dialog 入口统一直连 pi-agent 配置模块，确保用户设置优先级高于环境变量。

## 2026-06-13 — fix：项目工作区目录与本体 ID 解析

**类型**：fix
**影响模块**：`packages/web/src/components/os/workspace/WorkspaceWindow.tsx`、`packages/web/src/app/api/workspace/resolve/route.ts`、`packages/desktop/src/main/services/workspace-service.ts`
**摘要**：修复项目工作区未正常加载对应项目目录的问题。`WorkspaceWindow` 现在优先使用入口传入的 `basePath`，并统一兼容裸项目 ID、`proj-*`、`project-*` 包装 ID；Web API 与 Electron IPC 的 workspace resolve 同步做项目目录存在性探测并返回匹配的 `ontologyId`，避免工作区和项目本体图加载到错误目录。

## 2026-06-13 — fix：项目本体图谱主进程诊断日志

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/workspace-service.ts`、`packages/desktop/src/main/services/ontology-data-service.ts`
**摘要**：为桌面端项目窗体加载链路补充主进程诊断日志。`workspace:resolve` 会输出入口 ID、解析后的项目目录和 `ontologyId`；本体图谱相关 IPC 会输出 `ontologyId`、实际 `ontology.json` 路径、概念/关系/字段数量，并在错误日志中带上请求上下文，便于定位项目窗体本体图谱不加载问题。

## 2026-06-13 — fix：项目窗体本体 ID 规范化测试

**类型**：fix
**影响模块**：`packages/web/src/components/os/workspace/project-identity.ts`、`packages/web/src/components/os/workspace/__tests__/project-identity.test.ts`、`packages/web/src/components/os/workspace/WorkspaceWindow.tsx`、`packages/web/src/components/interview/InterviewWindow.tsx`
**摘要**：新增项目工作区身份规范化模块和定向单测，覆盖 `proj-*`、`project-proj-*`、旧 `ontology_*`、`ontology-project-proj-*` 等输入，统一归一到 `ontology-proj-*`。项目管理窗体和文件工作区共用该规范化逻辑，避免本体图谱因旧格式 `ontologyId` 读取错误目录。

## 2026-06-13 — fix：本体数据读取项目目录 ontology.json

**类型**：fix
**影响模块**：`packages/core/src/lib/features/ontology-data-store/{config.ts,index.ts,ontology-ops.ts}`、`packages/core/src/lib/features/ontology-data-store/__tests__/config.test.ts`
**摘要**：将 ontology-data-store 的路径解析统一为项目目录优先，兼容 `ontology-proj-*`、旧 `ontology_*`、误包装的 `ontology-project-proj-*`，最终都读取 `data/projects/{projectId}/ontology/ontology.json`。桌面 IPC 和 Web API 通过 core 共享同一套路径规则，避免桌面端本体视图与 Web 端读取路径不一致。

## 2026-06-15 — fix：用户 LLM 配置支持 Anthropic Auth Token 与 Provider 启用状态

**类型**：fix
**影响模块**：`packages/web/src/store/settingsStore.ts`、`packages/web/src/components/os/settings/SettingsDialog.tsx`、`packages/core/src/lib/features/user-config/index.ts`、`packages/core/src/lib/integrations/electron/services/misc.ts`、`packages/core/src/lib/integrations/pi-agent/{config.ts,llm-config.ts,server-config.ts}`
**摘要**：设置页为 Anthropic 增加 `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 两个独立字段，并为 Anthropic/OpenAI Compatible 增加启用开关。用户配置持久化扩展 `enabled/anthropicAuthToken/anthropicApiKey/anthropicBaseUrl` 字段，运行时模型创建兼容旧 `authToken/apiKey/baseUrl`，同时填写时优先使用 `ANTHROPIC_AUTH_TOKEN`，并继续保证用户配置优先于环境变量。

## 2026-06-16 — fix：技能窗体与技能执行补齐 workingDirectory

**类型**：fix
**影响模块**：`packages/web/src/components/skills/SkillDialog.tsx`、`packages/core/src/lib/features/skills/service.ts`、`packages/core/src/lib/integrations/pi-agent/tools/__tests__/working-directory.test.ts`
**摘要**：修复桌面技能窗体和 Web 技能执行链路在创建会话时未显式注入 `workingDirectory` 的隐患。系统技能按 `workDirStrategy` 解析到项目根目录，普通技能继续使用各自输出目录，避免 `write_file` 依赖空边界或 fallback 行为。

## 2026-06-16 — fix：Anthropic 运行时 credentialSource 归一化

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/server-config.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/server-config.test.ts`
**摘要**：修复运行时 Anthropic 模型把 `anthropicAuthToken` 误标成 `user.anthropicAuthToken` 的问题，导致下游 `credentialAuthMode` 误判为 `api-key`。现在统一回落到标准枚举值并兼容前缀来源，保证 `anthropicAuthToken` 正确走 OAuth/Bearer 路径。

## 2026-06-16 — fix：Anthropic Bearer 与 OAuth 模式拆分

**类型**：fix
**影响模块**：`pi-mono/packages/ai/src/{types.ts,providers/anthropic.ts}`、`packages/core/src/lib/integrations/pi-agent/server-config.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/server-config.test.ts`
**摘要**：将 `anthropicAuthToken` 从 Claude OAuth 模式中拆出，改为独立的 `bearer` 认证模式，避免自定义路由 token 被注入 Claude Code 专用头与 system prompt。`oauth` 仅保留给真正的 Claude OAuth token，Bearer 仅发送 `Authorization: Bearer`。

## 2026-06-16 — refactor：桌面端 src PiAgent 入口转发到 packages/core

**类型**：refactor
**影响模块**：`src/lib/integrations/pi-agent/{core/agent.ts,server-config.ts,llm-config.ts}`
**摘要**：保留 `src/` 目录结构不删除，但将桌面端仍在使用的 `src/lib/integrations/pi-agent` 旧入口改为转发到 `packages/core` 实现，统一运行时 LLM 配置、模型创建和认证逻辑，避免双份 PiAgent 实现继续分叉。

## 2026-06-16 — fix：skill-creator 技能定义去重并修正文档路径

**类型**：fix
**影响模块**：`skills/project-skill-creator/SKILL.md`、`packages/core/src/lib/integrations/pi-agent/__tests__/skills.test.ts`、`src/lib/integrations/pi-agent/__tests__/skills.test.ts`
**摘要**：修复 `skills/project-skill-creator` 误用 `name: skill-creator-app` 导致与首页 `skill-creator-app` 冲突的问题，避免加载到错误的技能说明并把新技能写到项目根 `skills/`。同时明确 `project-skill-creator` 仅能在 Agent 工作目录内生成 `skills/{skill-code}/`，与首页 `skill-creator-app` 的 `data/skills/{skill-code}/` 路径职责分离。

## 2026-06-16 — fix：creator 技能补齐显式 code 标识

## 2026-06-25 — feat：更新桌面端应用图标资源

**类型**：feat
**影响模块**：`resources/icons/icon.png`、`resources/icons/icon.icns`
**摘要**：基于新的 DNA x 电路视觉稿重生成桌面端图标主资源，整理为适合应用图标显示的 1024x1024 安全边距版本，并同步更新 macOS 与跨平台打包使用的图标文件。

## 2026-06-25 — fix：Dock hover 名称提示恢复显示

**类型**：fix
**影响模块**：`packages/web/src/components/os/dock/Tooltip.tsx`
**摘要**：修正 Dock tooltip 的 fixed 定位逻辑，根据左侧桌面 Dock 和底部 Web Dock 分别计算提示位置，恢复 hover 图标时显示入口/应用/技能名称。

## 2026-06-25 — fix：隔离 Pi Agent 会话事件避免技能窗体串消息

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/electron/services/agent-session.ts`、`packages/core/src/lib/integrations/electron/services/__tests__/agent-session.test.ts`
**摘要**：收紧 Electron 侧 `AGENT_EVENT` 订阅过滤条件，订阅方指定 `sessionId` 时仅接收显式携带同一 `sessionId` 的事件，并补充双会话流式链路回归测试，避免项目级广播误被 SkillDialog 消费导致消息串窗。

## 2026-06-25 — fix：解决方案窗体工作区按钮恢复可用

**类型**：fix
**影响模块**：`packages/web/src/components/solution/SolutionDesign.tsx`
**摘要**：将解决方案窗体右上角工作区按钮改为直接派发标准化的 `dock:action` 打开事件，不再依赖预先解析工作区目录成功，修复点击无响应的问题。

**类型**：fix
**影响模块**：`skills/skill-creator-app/SKILL.md`、`skills/project-skill-creator/SKILL.md`
**摘要**：为首页 `skill-creator-app` 和项目内 `project-skill-creator` 显式补齐 `code` frontmatter，确保 Dock/API 按技能标识解析时优先走稳定的 code 匹配，不再依赖展示名。

## 2026-06-16 — fix：桌面打包补齐 public 与应用图标资源

**类型**：fix
**影响模块**：`packages/web/public/.gitkeep`、`resources/icons/`
**摘要**：补齐 Electron 打包依赖的 `packages/web/public` 目录，并生成 macOS 打包可识别的应用图标资源，避免 `electron-builder` 因缺少 public 目录或 `.icns` 图标而中断。

## 2026-06-16 — fix：桌面包 main 入口改为归档内路径

**类型**：fix
**影响模块**：`packages/desktop/package.json`
**摘要**：将桌面包 `main` 从 workspace 相对路径改为 asar 内可解析的 `dist-electron/desktop/src/main/main.js`，避免 `electron-builder` 在产物校验阶段误判入口文件缺失。

## 2026-06-16 — fix：桌面打包改为收本地 dist-electron 产物

**类型**：fix
**影响模块**：`packages/desktop/package.json`、`packages/desktop/electron-builder.yml`
**摘要**：打包前将根目录 `dist-electron/` 同步到 `packages/desktop/dist-electron/`，并让 `electron-builder` 从 app 目录内收集主进程产物，避免归档中缺失 `dist-electron/desktop/src/main/main.js`。

## 2026-06-16 — fix：packaged Next standalone 目录对齐

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`、`electron-builder.yml`、`packages/desktop/src/main/main.ts`
**摘要**：将 packaged renderer 的启动根对齐到 `Resources/web/packages/web`，并显式打入 `standalone/node_modules`、`packages/web/.next/static`、`packages/web/public` 的对应层级，修复 `packages/web/node_modules/*` 符号链接在桌面包内失效的问题。

## 2026-06-16 — fix：macOS 改为手工封装 DMG

**类型**：fix
**影响模块**：`packages/desktop/package.json`、`packages/desktop/scripts/create-mac-dmg.js`
**摘要**：绕开 `electron-builder` 当前生成的损坏 DMG，改为先产出完整 `.app`，再用系统 `hdiutil create` 手工封装 `OriginOS CE-0.1.0-arm64.dmg`，避免镜像内 `Electron Framework.framework` 主二进制丢失。

## 2026-06-16 — fix：桌面运行时补齐 pi-agent 直接依赖

**类型**：fix
**影响模块**：`packages/desktop/package.json`
**摘要**：将 `@mariozechner/agent` 和 `@mariozechner/pi-ai` 显式加入桌面包依赖树，修复 packaged app 在加载 `dist-electron/core/src/lib/integrations/pi-agent/core/agent.js` 时出现 `Cannot find module '@mariozechner/agent'`。
## 2026-06-26 — refactor：统一 skill 与多 Agent 协作的记忆接入规则

**类型**：refactor
**影响模块**：`packages/core/src/lib/features/services/launcher/skill.ts`、`packages/core/src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts`、`packages/core/src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts`、`packages/core/src/lib/integrations/pi-agent/project-agent/__tests__/collaboration-prompt.test.ts`
**摘要**：将 `skill` 启动链改为按需继承 `Memory.md`、`Knowledge.md`、`Patterns.md`，并把多 Agent 协作上下文与 prompt 构建切到统一的稳定记忆/知识快照 contract。这样 `skill`、`project/persistent project agent`、`role-agent`、`multi-agent` 在 prompt 层开始共享一致的长期记忆注入规则，同时避免 Recall 摘要继续占据高优先级 system prompt。 

## 2026-06-26 — refactor：role-agent 退出 Dream 主路径并抽取 recent trace 压缩策略

**类型**：refactor
**影响模块**：`packages/core/src/lib/features/services/launcher/role-agent.ts`、`packages/core/src/lib/integrations/pi-agent/recent-trace-compression.ts`、`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：停止在 `role-agent` 的 `turn_end` 主路径中触发 Dream 自动整理，保留 MemoryTracker/Recall 的历史记录与周期 flush；同时将多 Agent 的 recent trace 保真压缩提炼为可复用工具，作为后续统一运行时压缩策略的基础。 

## 2026-06-26 — refactor：recent trace 压缩下沉到 OriginOSAgent 通用 prompt 入口

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：将 recent trace 保真压缩统一下沉到 `OriginOSAgent.prompt()`，让 in-process `agent/project/role-agent/skill` 与多 Agent worker 共用同一条消息压缩路径，避免不同启动方式各自维护一份历史裁剪逻辑。 

## 2026-06-26 — refactor：MemoryTracker 停止向 Memory.md 追加 turn 摘要

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/role-agent/memory-tracker.ts`、`packages/core/src/lib/integrations/pi-agent/role-agent/__tests__/memory-tracker.test.ts`
**摘要**：按 `M.11 / Phase 2` 收敛旧写路径，`MemoryTracker.flushMemory()` 不再把 turn 级摘要批量追加到 `Memory.md`，而是只确保 `memory-core` 的 block 版 `Memory.md` 持久化存在，逐轮历史继续保留在 recall/history store 中。 

## 2026-06-26 — refactor：为 memory-core 补上 session_end consolidation 入口

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/core/consolidator.ts`、`packages/core/src/modules/memory-core/core/memory-core.ts`、`packages/core/src/modules/memory-core/session/memory-provider.ts`
**摘要**：按 `M.11 / Phase 1` 为 `memory-core` 建立正式的 `on_session_end` consolidation 入口，统一由 `MemoryProvider` 在 session 生命周期末尾触发 history-to-cognition 收敛，并为 `ConsolidationResult` 增加 stable memory / pattern / knowledge candidate 分类壳，作为后续完整分类实现的接口基础。 

## 2026-06-26 — refactor：consolidator 开始分流 stable memory 与 reflection

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/core/consolidator.ts`
**摘要**：按 `M.11 / Phase 3-4` 将 consolidation 从“只写 stable memory”推进到启发式分流：含长期偏好/约束信号的用户表达保留为 `stableMemory`，含失败工具链的 turn 则写入 archival reflection，开始把长期稳定认知和失败经验从单一 `Memory.md` 输出中拆开。 

## 2026-06-26 — test：补齐 core 记忆链路 vitest 配置与 consolidation 回归测试

**类型**：test
**影响模块**：`packages/core/vitest.config.ts`、`packages/core/src/modules/memory-core/__tests__/consolidator.test.ts`
**摘要**：为 `packages/core` 增加独立 vitest 配置，修复原先沿用根配置导致 setupFiles 指向失效的问题；同时新增 `memory-core` consolidator 回归测试，覆盖 stable memory 提取与失败工具链 reflection 分流，并与 `memory-tracker` 测试一起通过。 

## 2026-06-26 — refactor：knowledgeCandidates 开始从 consolidation 真实产出

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/core/consolidator.ts`、`packages/core/src/modules/memory-core/__tests__/consolidator.test.ts`
**摘要**：将 `ConsolidationResult.knowledgeCandidates` 从空壳推进到真实启发式输出，支持从 turn history 中提取实体候选与成功工具结果事实，并新增对应单测；当前 memory 相关回归测试组合为 `14` 项全部通过。 

## 2026-06-26 — refactor：MemoryProvider 开始消费 consolidation 产物

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/session/memory-provider.ts`、`packages/core/src/modules/memory-core/__tests__/tools-provider.test.ts`
**摘要**：为 `MemoryProvider` 增加最近一次 consolidation 结果缓存与统一查询接口，`prefetch()` 现在能把 `stableMemory` 和 `knowledgeCandidates` 作为普通补充上下文返回；同时补齐消费侧测试。当前记忆 story 相关组合回归为 `3` 个 test files、`40` 个 tests 全通过。 

## 2026-06-26 — refactor：MemoryProvider 暴露结构化 queryMemory 接口

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/session/memory-provider.ts`、`packages/core/src/modules/memory-core/__tests__/tools-provider.test.ts`
**摘要**：按 `M.11 / Phase 4` 为 memory-core 增加结构化统一查询接口 `queryMemory()`，显式返回 `recent_history / stable_memory / pattern / reflection / knowledge_candidate` 五类结果，并保持 `prefetch()` 基于该接口拼装普通补充上下文。相关记忆链组合回归提升为 `41` 个 tests 全通过。 

## 2026-06-26 — refactor：knowledgeCandidates 增加统一持久化出口

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/session/memory-provider.ts`、`packages/core/src/modules/memory-core/__tests__/tools-provider.test.ts`
**摘要**：为 session_end consolidation 产出的 `knowledgeCandidates` 增加统一持久化出口 `knowledge/candidates.json`，避免候选知识只存在于内存查询层；同时补齐对应测试，确保 MemoryProvider 在消费 consolidation 结果时能写盘并再次读回。 

## 2026-06-26 — refactor：knowledgeCandidates 接入 KnowledgeProvider 消费链

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/cognitive/knowledge-provider.ts`、`packages/core/src/modules/memory-core/session/memory-provider.ts`、`packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts`、`packages/core/src/lib/integrations/pi-agent/cognitive/__tests__/knowledge-provider.test.ts`、`packages/core/src/modules/memory-core/__tests__/tools-provider.test.ts`
**摘要**：为 `KnowledgeProvider` 增加 `ingestCandidates()` 入口，并让 `MemoryProvider.on_session_end()` 可选将 consolidation 产出的 `knowledgeCandidates` 交给知识系统消费；`PersistentAgentManager` 已将两者接线。当前记忆 story 相关回归提升为 `4` 个 test files、`43` 个 tests 全通过。 

## 2026-06-26 — test：接入 loop detector 并补齐 OriginOSAgent 回归

**类型**：test
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`、`packages/core/src/lib/integrations/pi-agent/tools/__tests__/loop-detector.test.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/setup.ts`
**摘要**：将 loop detector 接入 `OriginOSAgent` 的 `tool_execution_start` 事件，在重复相同工具调用时向消息历史注入循环警告，并在 agent 销毁时清理会话级 detector；同时补齐 `pi-ai` stream mock 与回归测试，当前 `agent + memory` 组合回归为 `6` 个 test files、`69` 个 tests 全通过。 

## 2026-06-26 — refactor：sync_turn 停止把逐轮内容写入 Memory.md

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/session/memory-provider.ts`、`packages/core/src/modules/memory-core/__tests__/tools-provider.test.ts`、`docs/design/memory-core.md`
**摘要**：进一步收紧 `Memory.md` 的单写者边界，`MemoryProvider.sync_turn()` 不再把用户消息追加到 `temporal` block，turn 级运行时轨迹只保留在 recall/history；同时新增回归测试验证临时计划不会被逐轮写入长期记忆。当前 `agent + memory` 组合回归提升为 `7` 个 test files、`73` 个 tests 全通过。 

## 2026-06-26 — refactor：Dream 从 role-agent 默认导出面降级为兼容壳

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/role-agent/index.ts`、`packages/core/src/lib/integrations/pi-agent/role-agent/__tests__/index.test.ts`、`docs/design/agent-skill-standard.md`、`docs/design/supervisor-agent.md`
**摘要**：将 `Dream` 从 `role-agent` barrel 的默认运行时导出面移除，保留 `dream.ts` 文件作为兼容壳单独可测可访问；同时将设计文档中的默认叙述改为由 `memory-core consolidation` 负责长期记忆整理，避免继续把 Dream 表述为主路径能力。 

## 2026-06-26 — refactor：多 Agent worker 在 shutdown 时触发 cognitive session_end

**类型**：refactor
**影响模块**：`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`、`packages/core/src/modules/collaboration-runtime/sandbox/cognitive-session-end.ts`、`packages/core/src/modules/collaboration-runtime/sandbox/__tests__/cognitive-session-end.test.ts`
**摘要**：为多 Agent worker 的 shutdown 路径补上 `on_session_end()` flush，确保 collaboration runtime 也能触发 memory-core consolidation，而不是只做 `on_turn_end` 记录；同时新增最小单测验证 session_end flush helper 的调用行为。当前 `agent + memory + collaboration` 组合回归提升为 `10` 个 test files、`93` 个 tests 全通过。 

## 2026-06-26 — test：补齐长会话稳定性回归样例

**类型**：test
**影响模块**：`packages/core/src/lib/integrations/pi-agent/__tests__/long-session-stability.test.ts`、`docs/specs/epic-OS/story-OS.13/README.md`
**摘要**：新增长会话稳定性回归，覆盖“重复工具失败”“多 Agent 协作纠偏”“旧计划干扰但 recent trace 保留”三类样例，直接验证压缩后关键失败信息仍可见且 loop detector 能在长链尾部介入。当前 `agent + memory + collaboration` 组合回归提升为 `11` 个 test files、`96` 个 tests 全通过。 
## 2026-06-26 — refactor：Dream Phase 2 下沉到 memory-core

**类型**：refactor
**影响模块**：`packages/core/src/modules/memory-core/core/`, `packages/core/src/modules/memory-core/__tests__/`, `packages/core/src/lib/integrations/pi-agent/role-agent/dream.ts`, `docs/specs/epic-M/story-M.11/README.md`
**摘要**：将 Dream 兼容壳里的 `[ADD]/[UPDATE]/[REMOVE]` Phase 2 指令解析与 `Memory.md` 变更语义迁入 `memory-core` 的 `dream-compat` helper，`role-agent/dream.ts` 只保留文件读写包装与返回格式兼容。新增 `memory-core` 侧单测覆盖 legacy Dream 指令解析和应用行为，并将 M.11 Phase 3 对应项标记为已完成。

## 2026-06-26 — refactor：MemoryBlockManager 改为委托 memory-core 单写者

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/role-agent/memory-tracker.ts`, `docs/specs/epic-M/story-M.11/README.md`
**摘要**：将遗留 `MemoryBlockManager` 从自管 `Memory.md` 文件读写改为直接委托 `MemoryCore.memory`，清除运行时代码中除 `memory-core/core/memory.ts` 外的长期记忆直接写入口。结合既有 long-session、role-agent、project-agent、multi-agent 回归样例，M.11 中“长期记忆单写者”和迁移验证条目已可按证据勾完成。

## 2026-06-26 — refactor：引入运行时工作摘要并用于 loop 风险纠偏

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/runtime-working-summary.ts`, `packages/core/src/lib/integrations/pi-agent/core/agent.ts`, `packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`, `packages/core/src/lib/integrations/pi-agent/__tests__/long-session-stability.test.ts`, `docs/specs/epic-OS/story-OS.13/README.md`
**摘要**：新增运行时 `Working Summary` 层，从最近消息中提取“当前任务 / 最近失败原因 / 禁止重复动作”，在 `OriginOSAgent.prompt()` 前注入普通消息，并在 loop detector 触发 warning 时一并附带。这样当前任务摘要不再混入长期记忆，同时 OS.13 中关于 loop 风险纠偏与工作摘要分层的剩余项也有了代码和测试证据。 

## 2026-06-26 — docs：完成 OS.13 与 M.11 状态收口

**类型**：docs
**影响模块**：`docs/specs/epic-OS/story-OS.13/README.md`, `docs/specs/epic-M/story-M.11/README.md`
**摘要**：在完整实现与组合单测通过后，将 `OS.13` 与 `M.11` 的 story 状态从 `In Progress` 收口为 `Complete`，使文档状态与当前代码和验证证据保持一致。 

## 2026-06-26 — fix：桌面引导面板裁切与 Dock 高亮联动

**类型**：fix
**影响模块**：`packages/web/src/components/os/DesktopOnboarding.tsx`, `packages/web/src/app/dock/page.tsx`, `packages/desktop/src/main/window-manager.ts`
**摘要**：修复桌面引导气泡在小视口或贴边场景下显示不全、导致“下一步”按钮不可点击的问题，改为视口约束下的可滚动布局；同时为桌面端 Dock 引导步骤增加独立 Dock BrowserWindow 联动，进入该步骤时会真实展开并高亮 Dock overlay，而不是只在主窗口里绘制虚拟高亮。 

## 2026-06-26 — refactor：收紧桌面包生产依赖以缩减体积

**类型**：refactor
**影响模块**：`packages/desktop/package.json`
**摘要**：移除桌面包中未参与 Electron 运行时加载的 `@originos/core` 和 `@originos/web` 生产依赖，避免 electron-builder 将不必要的 workspace 依赖树一并卷入 `app.asar`，并为后续打包体积优化建立更干净的基线。 

## 2026-06-26 — refactor：清理根包与 Web 的未使用/重复依赖

**类型**：refactor
**影响模块**：`package.json`、`packages/web/package.json`
**摘要**：移除根包中已由桌面子包单独声明的重复 Electron 工具链依赖，并清理 `packages/web` 中未被源码引用的 `@dnd-kit/sortable`，降低工作区依赖噪声并为后续体积优化减少无效输入。 

## 2026-06-26 — fix：桌面引导第一步改为模型配置且移除默认 LLM 启用态

**类型**：fix
**影响模块**：`packages/web/src/store/settingsStore.ts`、`packages/web/src/components/os/DesktopOnboarding.tsx`、`packages/web/src/app/page.tsx`
**摘要**：桌面引导第一步改为“先配置大模型”，直接高亮右上角设置入口并提供打开设置操作；同时移除前端默认启用的 Anthropic 配置，首次进入时不再预置可用模型，必须由用户显式完成 LLM 设置。 

## 2026-06-27 — fix：修复 mac 包双击退回默认 Electron 壳

**类型**：fix
**影响模块**：`package.json`、`packages/desktop/electron-builder.yml`
**摘要**：修复了工作区根 `package.json` 损坏导致 Electron 打包时入口元数据异常的问题。重新生成的 mac 包内 `app.asar/package.json` 已恢复为有效的桌面入口配置，避免双击应用时退回默认的 “To run a local app...” 提示。 

## 2026-06-27 — fix：统一 Agent 流式帧去重并缩减 mac 包体积

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/stream-dedupe.ts`、`packages/core/src/lib/features/skills/service.ts`、`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`、`package.json`
**摘要**：扩大流式帧去重窗口并将 skill/agent 兼容路径接入同一套可见 delta 合并逻辑，避免 `stopReason=length` 自动续写或 provider 发送累计文本时重复渲染内容；同时刷新 workspace 依赖树，移除桌面包中残留的 `@originos/web` / `@originos/core` 打包输入，使 mac DMG 从约 492M 降至约 204M。 

## 2026-06-27 — fix：补齐桌面包运行时依赖并拦截 Agent 生成循环

**类型**：fix
**影响模块**：`packages/desktop/package.json`、`packages/core/src/lib/integrations/pi-agent/stream-dedupe.ts`、`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/stream-dedupe.test.ts`
**摘要**：桌面包在保留瘦身后的 `app.asar` 结构时，显式声明编译后 core 主进程会加载的生产依赖，修复启动时报 `Cannot find module 'uuid'` 的问题；同时在 `OriginOSAgent` 事件转发前增加重复尾部检测，遇到同一段 assistant 文本连续生成时截断最终消息并 abort 当前流，覆盖项目、Agent、Skill 共用链路。 

## 2026-06-27 — fix：修正 Agent 运行时摘要注入与认知同步边界

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/runtime-working-summary.ts`、`packages/core/src/lib/integrations/pi-agent/core/agent.ts`、`packages/core/src/lib/integrations/pi-agent/recent-trace-compression.ts`、`packages/core/src/lib/integrations/pi-agent/agent-manager.ts`、`packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/recent-trace-compression.test.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/agent-manager.test.ts`
**摘要**：将 `Working Summary` 与 loop warning 从 `assistant` 历史消息改为 `system` 注入，避免模型把内部运行时摘要当成自己上一条未完成回复继续续写；同时重写 recent trace 压缩为“保留最近完整轮次 + 最近工具轨迹”，并修复 in-process cognitive sync 把 assistant 文本误记为 user 文本的问题。该修复针对的是生成循环的架构根因，而不仅是流式重复的表层症状。 

## 2026-06-27 — fix：补齐四链路回归并增强近似重复 loop guard

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/stream-dedupe.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/stream-dedupe.test.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/cross-entry-loop-protection.test.ts`、`packages/core/src/lib/integrations/pi-agent/__tests__/long-session-stability.test.ts`
**摘要**：在原有“完全重复尾部”截断之外，新增对近似重复/轻微改写重复段落的相似度检测，减少同一 assistant message 中反复改写同一段话的死循环；同时补充 assistant、skill、role-agent、多 agent 四条运行链路的共享内核回归测试，确保运行时摘要、trace 压缩与用户纠偏信息在不同启动方式下都保持一致语义。 

## 2026-06-27 — fix：统一 assistant 可显示内容提取并兼容 thinking-only 回复

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/display-content.ts`、`packages/core/src/lib/integrations/pi-agent/message.ts`、`packages/core/src/lib/features/skills/service.ts`、`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`、`packages/desktop/src/main/services/agent-session-service.ts`、`packages/desktop/src/main/services/agent-project-service.ts`、`packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`
**摘要**：新增统一的 assistant 可显示内容提取函数，优先返回 `text` block，在上游 provider 异常只返回单个 `thinking` block 时回退为可显示文本，避免出现“turn 已完成但 UI 无回复”的不一致；同时将 desktop、web、skill、worker 等链路收口到同一提取规则，消除各处各自只认 `text` 导致的行为漂移。 

## 2026-06-28 — fix：为 Agent 重复输出诊断补充 turn/message 指纹日志

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`
**摘要**：在 `OriginOSAgent` 事件链路中新增 `turnSeq`、`assistantMsgSeq`、`textHash`、`sameAsPreviousAssistant` 和 loop guard 预览日志，用于区分重复文本是发生在同一 assistant turn 内，还是跨 turn 复现；该变更仅增强诊断信息，不改变既有执行逻辑。 
## 2026-06-29 — fix：solution-design 去除 Stage 1 确认式提问

**类型**：fix
**影响模块**：`skills/solution-design/SKILL.md`, `data/projects/proj-1782283599327-r96a3fvsh/skills/solution-design/SKILL.md`, `packages/core/src/lib/integrations/pi-agent/tools/registry.ts`, `packages/core/src/lib/integrations/pi-agent/agent-manager.ts`, `packages/core/src/lib/features/services/launcher/skill.ts`, `packages/web/src/components/solution/SolutionDesign.tsx`, `packages/core/src/lib/features/user-config/index.ts`, `packages/core/src/lib/integrations/pi-agent/user-preferences.ts`, `packages/web/src/store/settingsStore.ts`, `packages/web/src/components/os/settings/SettingsDialog.tsx`
**摘要**：修正 AI 解决方案窗体直跑 `solution-design` 技能时的阶段流转约束。Stage 1 在呈现建模维度推荐后不再要求“Ask if they agree”或软性确认；同时从 `skill` 类型工具集里移除 `ask_user_question`，并在 skill 系统级 prompt 中增加“探索即直接调工具、tool call 前最多一句过渡语”的约束，减少解释性文本自重复。另修复方案窗体顶部“打开工作区”按钮无响应的问题，改为在当前窗体内直接打开 `WorkspaceWindow`，不再依赖首页 `dock:action` 监听；并新增全局用户语言偏好设置，统一注入到各类 Agent Runtime 的 system prompt。 

## 2026-06-29 — fix：统一 skill runtime 的工作目录语义

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/file-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/url-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/context.ts`, `packages/core/src/lib/features/services/launcher/skill.ts`, `packages/web/src/components/skills/SkillDialog.tsx`, `packages/core/src/lib/integrations/pi-agent/tools/__tests__/working-directory.test.ts`
**摘要**：修复 skill runtime 把 `skillOutputDir` 错当成默认项目路径的问题，统一改为以 `workingDirectory` 作为文件工具和文档工具的默认语义根目录，`skillOutputDir` 仅保留为显式产物输出提示。同步更新 skill system prompt 和工作目录测试，避免 AI 解决方案等项目型技能把 `solutions/` 误当作整个工作空间。 

## 2026-06-30 — docs：新增桌面应用自动更新机制规划

**类型**：docs
**影响模块**：`docs/specs/epic-OS/story-OS.15/README.md`, `docs/specs/epic-OS/README.md`
**摘要**：新增 OS.15 Story，规划基于 `electron-builder`、`electron-updater` 与 GitHub Releases 的桌面自动更新机制，覆盖发布产物、CI、客户端检查下载安装、设置页 UI、安全签名、公证、灰度和回滚策略。

## 2026-06-30 — fix：降低 native 子窗体全局挂载开销并补充窗口诊断日志

**类型**：fix
**影响模块**：`packages/web/src/components/os/GlobalSpotlight.tsx`, `packages/desktop/src/main/window-manager.ts`
**摘要**：排查打开窗体时 CPU 瞬时升高的问题，确认 native BrowserWindow 会独立加载 `/window` renderer。修复子窗体重复挂载桌面级 Spotlight/全局快捷键的问题，并在 Electron 窗口管理器中补充 create/reuse/closed 日志，便于后续区分重复创建、renderer 启动成本和 Agent 初始化成本。

## 2026-07-01 — fix：降低 Agent 初始化阶段 CPU 峰值

**类型**：fix
**影响模块**：`packages/core/src/modules/memory-core/archival/archival-memory.ts`, `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/index.ts`, `packages/core/src/lib/integrations/pi-agent/agent-manager.ts`, `packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts`
**摘要**：修复 Agent 初始化时构造 ArchivalMemory 会后台重建全部历史 embedding、PatternProvider 每次新实例重复迁移旧 patterns/reflections 的问题。Archival 索引改为首次语义搜索时惰性构建，Pattern 迁移增加磁盘级完成标记，并将项目 Agent 的 PatternProvider 初始化移到后台执行，同时补充初始化分段耗时日志用于定位后续 CPU 热点。

## 2026-07-02 — feat：启动桌面自动更新 story 实施

**类型**：feat
**影响模块**：`packages/desktop/src/main/auto-updater.ts`, `packages/desktop/src/main/main.ts`, `packages/desktop/src/main/ipc-protocol.ts`, `packages/core/src/lib/integrations/electron/ipc-protocol.ts`, `packages/core/src/lib/integrations/electron/services/auto-update.ts`, `packages/web/src/components/os/settings/SettingsDialog.tsx`, `packages/desktop/electron-builder.yml`, `packages/desktop/package.json`, `package.json`, `.github/workflows/desktop-release.yml`, `docs/specs/epic-OS/story-OS.15/README.md`, `docs/specs/epic-OS/story-OS.15/test-plan.md`
**摘要**：补齐 OS.15 第一阶段自动更新主链路：桌面主进程提供 updater 状态机与 IPC，设置页展示版本、检查、下载进度和重启安装入口，并新增 macOS GitHub Release 发布脚本、tag 触发 CI 与测试计划。

## 2026-07-02 — fix：补齐 user-config 大模型配置回填

**类型**：fix
**影响模块**：`packages/core/src/lib/features/user-config/index.ts`, `packages/core/src/lib/features/user-config/__tests__/user-config.test.ts`, `packages/desktop/src/main/services/misc-service.ts`, `packages/web/src/app/api/user-config/route.ts`, `packages/web/src/components/os/settings/SettingsDialog.tsx`
**摘要**：修复设置页打开时 `user-config.json` 缺少 LLM 配置不会从产品运行时配置回填的问题。`GET user-config` 现在会在 `llm` 缺失时从当前环境变量生成默认大模型配置并写回文件，同时保留已有用户配置优先级，避免覆盖用户主动保存或禁用的设置。

## 2026-07-02 — fix：macOS 同时发布 Apple Silicon 与 Intel 包

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`, `packages/desktop/package.json`, `packages/desktop/scripts/create-mac-dmg.js`, `.github/workflows/desktop-release.yml`, `docs/specs/epic-OS/story-OS.15/README.md`, `docs/specs/epic-OS/story-OS.15/test-plan.md`
**摘要**：将 macOS 桌面打包目标从仅 arm64 扩展为 arm64 + x64，发布 workflow 名称和 OS.15 文档同步更新；本地自定义 DMG 脚本改为同时读取 `release/mac-arm64` 与 electron-builder x64 默认输出 `release/mac`，避免 Intel 包在本地打包链路中缺失。

## 2026-07-02 — fix：Agent provider 错误前台可见

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`, `packages/desktop/src/main/services/agent-session-service.ts`
**摘要**：修复模型服务返回 400 / data inspection 等 provider 异常时只写入后台日志、前台无明显反馈的问题。`OriginOSAgent.prompt()` 现在会 emit `agent_error`，Electron stream bridge 会将错误格式化为 assistant 消息并落盘，同时广播 `assistant_message` 与 `error` 事件，保证用户在会话前台能直接看到失败原因。

## 2026-07-02 — fix：Dock 点击已打开窗口无法回到前台

**类型**：fix
**影响模块**：`packages/desktop/src/main/window-manager.ts`, `packages/web/src/store/appWindowStore.ts`
**摘要**：修复 Dock 点击已运行窗口时只调用 focus、未恢复最小化/隐藏原生 BrowserWindow 的问题。Electron native window 复用和聚焦链路现在会先 `restore/show` 再 `focus`，前端窗口状态聚焦时也会从 `minimized` 恢复为 `normal`，保证 Dock 再次点击能把已有窗体带回前台。

## 2026-07-02 — fix：AI 解决方案窗体启动竞态

**类型**：fix
**影响模块**：`packages/web/src/components/solution/SolutionDesign.tsx`
**摘要**：修复打包产品中打开 AI 解决方案设计窗体后未自动启动的问题。`SolutionDesign` 现在会等待 `usePiAgent.initialize()` 完成后再结束初始化并触发 auto-start，避免 `sendMessageStream()` 抢跑导致 “Agent 未初始化”；初始化或自动启动失败时也会以 assistant 消息显示在窗体内，不再只写入 console。

## 2026-07-02 — feat：打包版窗口支持右键 Inspect

**类型**：feat
**影响模块**：`packages/desktop/src/main/devtools-context-menu.ts`, `packages/desktop/src/main/main.ts`, `packages/desktop/src/main/window-manager.ts`
**摘要**：为打包版 Electron 主窗口、Dock 窗口和所有原生子窗体增加右键调试菜单，支持 `Inspect Element`、`Open DevTools` 和 `Reload Window`。用于排查打包环境下多 Agent runtime 的 client-side 报错，不再依赖开发态自动打开 DevTools。

## 2026-07-02 — fix：打包态业务访谈同步生成本体

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/project-service.ts`
**摘要**：修复桌面打包态 `PROJECT_SYNC_ONTOLOGY` IPC 只返回成功但不生成 `ontology/ontology.json` 的问题。现在业务访谈完成后会从 `output/business-model.json` 生成项目本体、概念数据目录和实例关系文件，并同步更新项目 `ontologyId`。

## 2026-07-02 — fix：补齐生产版多 Agent runtime 启动日志

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/collaboration-service.ts`, `packages/core/src/modules/collaboration-runtime/facade/session-store.ts`, `packages/core/src/modules/collaboration-runtime/facade/hitl-dispatcher.ts`, `packages/core/src/modules/collaboration-runtime/facade/dag-runner.ts`, `packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-spawner.ts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`
**摘要**：为生产版多 Agent supervisor/worker 启动链路增加 `[MultiAgentRuntime]` 结构化日志，覆盖 IPC 收包、session 配置、DAG 启动、supervisor/worker spawn、worker initialize/model create/prompt 阶段。日志只记录 provider/model/baseUrl、凭据是否存在和来源，不输出密钥。

## 2026-07-02 — fix：macOS Intel 强制 ANGLE GL 后端

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`
**摘要**：为 macOS x64 打包版本在 Electron app ready 前追加 `app.commandLine.appendSwitch('use-angle', 'gl')`，规避 Intel 机型默认图形后端兼容问题；Apple Silicon 不受影响。同时将 `[MultiAgentRuntime]` 纳入桌面端 LLM 日志捕获前缀。

## 2026-07-02 — feat：Dock 支持左侧、底部和右侧配置

**类型**：feat
**影响模块**：`packages/core/src/types/os.ts`, `packages/web/src/store/dockStore.ts`, `packages/web/src/components/os/dock`, `packages/web/src/app/dock/page.tsx`, `packages/web/src/components/os/settings/SettingsDialog.tsx`, `packages/desktop/src/main/window-manager.ts`, `packages/web/src/components/os/DesktopOnboarding.tsx`
**摘要**：Dock 位置新增 `left` / `bottom` / `right` 配置并持久化，设置页可切换位置；Web Dock、Electron 独立 Dock 窗口、hover 热区、Tooltip 和引导高亮均按配置同步调整，避免只支持固定左侧或底部。

## 2026-07-02 — fix：修复引导定位和设置弹窗误关闭

**类型**：fix
**影响模块**：`packages/web/src/components/os/DesktopOnboarding.tsx`, `packages/web/src/components/os/settings/SettingsDialog.tsx`
**摘要**：桌面引导切到项目区等目标步骤时，会先把目标区域滚动到视口中间再计算高亮和气泡位置，避免“下一步”超出窗口无法点击。LLM 设置弹窗取消遮罩点击关闭，防止点击窗体外区域导致未保存的大模型配置草稿丢失。

## 2026-07-03 — fix：修复生产版多 Agent worker 打包入口

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/sandbox/agent-spawner.ts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-spawner.js`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mjs`, `packages/desktop/electron-builder.yml`, `packages/desktop/src/main/agent-worker-runtime-deps.ts`, `packages/desktop/scripts/verify-agent-worker-runtime.js`, `packages/desktop/package.json`
**摘要**：修复生产包多 Agent supervisor 子进程启动后立即 code 1 退出的问题。父进程现在显式传入 `ORIGINOS_AGENT_WORKER_DIR` 和 `ORIGINOS_CORE_SRC_DIR`，worker 不再在 ESM 入口使用 `require('electron')` 判断打包态，并通过统一 resolver 从 app.asar 的 core 编译产物加载运行时依赖；新增 desktop 编译锚点强制输出 worker 动态依赖，并在 `build:app` 中加入 `verify-agent-worker-runtime` 打包前校验，确保缺失动态依赖会在编译/打包前被拦截。

## 2026-07-03 — fix：隔离停止后的流式消息事件

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/client-hooks.ts`, `packages/core/src/lib/integrations/pi-agent/client-hooks.js`, `packages/core/src/lib/integrations/electron/services/agent-session.ts`, `packages/desktop/src/main/services/agent-session-service.ts`, `packages/core/src/lib/integrations/pi-agent/__tests__/client-hooks-session-isolation.test.ts`
**摘要**：修复点击停止后旧流式事件仍可能写回已停止 assistant 消息、并污染下一次流式输出的问题。每次流式发送现在生成本地 `streamId`，Electron 主进程会把该 `streamId` 回传到所有 `AGENT_EVENT`，前端只处理当前 stream 的事件；abort 和新发送会立即取消旧订阅并使旧 stream 失效，避免重复消息和跨 turn 写入。

## 2026-07-03 — fix：关闭单 Agent 原生窗体时停止 runtime

**类型**：fix
**影响模块**：`packages/web/src/hooks/useAppWindowManager.ts`
**摘要**：修复 Dock 启动的单 Agent 原生窗体关闭后，窗口状态已移除但对应 Pi Agent runtime 仍留在主进程的问题。`useAppWindowManager` 现在会按窗口 metadata 注入与 `AppWindowManager` 一致的 `onClose` 生命周期，关闭 role-agent / agent / project / solution / skill 窗体时会销毁对应 agent session 并触发 memory consolidation。

## 2026-07-03 — docs：重写项目 README

**类型**：docs
**影响模块**：`README.md`
**摘要**：用当前项目实际架构和运行方式替换 GitLab 模板 README，补充 OriginOS 定位、核心能力、workspace 结构、LLM 环境变量、开发/打包/验证命令、数据目录和架构约束入口，便于新开发者按当前桌面与多 Agent runtime 链路启动项目。

## 2026-07-03 — docs：OS.15 自动更新改为七牛 OSS/CDN 发布源

**类型**：docs
**影响模块**：`docs/specs/epic-OS/story-OS.15/README.md`, `docs/specs/epic-OS/story-OS.15/test-plan.md`
**摘要**：将桌面自动更新 Story 从 GitHub Release 发布源调整为七牛 OSS/CDN。方案明确使用 `electron-updater` generic provider，发布脚本上传 DMG、blockmap 和 `latest-mac.yml` 到七牛，客户端从七牛 CDN 更新目录检查并下载更新。

## 2026-07-03 — feat：新增七牛 CDN 更新产物发布脚本

**类型**：feat
**影响模块**：`package.json`, `packages/desktop/package.json`, `packages/desktop/scripts/publish-qiniu-updates.js`, `pnpm-lock.yaml`, `docs/specs/epic-OS/story-OS.15/README.md`, `docs/specs/epic-OS/story-OS.15/test-plan.md`
**摘要**：参考现有七牛 SDK 用法，为桌面包新增 `publish-qiniu-updates.js`，支持通过 `qiniu` Node SDK 上传 macOS DMG、blockmap 和更新 yml 到七牛 OSS/CDN。新增 `desktop:dist:qiniu` 与 `desktop:publish:qiniu` 命令，凭据兼容 `QINIU_ACCESS_KEY/QINIU_SECRET_KEY` 和 `QINIU_AK/QINIU_AS`。

## 2026-07-03 — fix：七牛发布脚本支持读取 .env

**类型**：fix
**影响模块**：`.env.example`, `packages/desktop/package.json`, `packages/desktop/scripts/publish-qiniu-updates.js`, `docs/specs/epic-OS/story-OS.15/test-plan.md`
**摘要**：七牛发布脚本新增 dotenv 加载逻辑，支持从 `packages/desktop/.env.local`、`packages/desktop/.env`、根 `.env.local` 和根 `.env` 读取发布凭据与 CDN 配置，同时保留 shell 环境变量最高优先级。

## 2026-07-03 — fix：七牛发布脚本重新生成 mac 更新元数据

**类型**：fix
**影响模块**：`packages/desktop/scripts/publish-qiniu-updates.js`
**摘要**：修复七牛发布可能上传旧 `stable-mac.yml` 的问题。发布脚本现在会根据当前 release 目录内实际 DMG 重新计算 size 和 sha512，生成并同步上传 `latest-mac.yml` 与 `stable-mac.yml`，避免更新元数据指向旧文件名或旧校验值。

## 2026-07-03 — feat：七牛发布命令自动递增版本

**类型**：feat
**影响模块**：`package.json`, `packages/desktop/package.json`, `packages/desktop/scripts/bump-release-version.js`, `docs/specs/epic-OS/story-OS.15/README.md`, `docs/specs/epic-OS/story-OS.15/test-plan.md`
**摘要**：新增桌面发布版本递增脚本，`pnpm desktop:dist:qiniu` 默认在打包前自动 patch 自增根包和桌面包版本，避免同版本覆盖导致已安装客户端无法触发自动更新；同时支持 `RELEASE_VERSION=minor|major|x.y.z` 指定发布版本策略。

## 2026-07-04 — fix：command 工具兼容 zsh/bash 候选 shell

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/bash-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/bash-tools.js`, `packages/core/src/lib/integrations/pi-agent/tools/__tests__/bash-tools-shell.test.ts`
**摘要**：修复 `execute_command` 在 `SHELL` 被配置为 `zsh bash` 等候选列表时把整串当成可执行文件导致命令不可用的问题。command 工具不再读取 `CLAUDE_CODE_SHELL` 覆盖变量，只解析标准 `SHELL` 并按内置 bash/zsh/sh 路径 fallback。

## 2026-07-07 — docs：新增 OS.16 系统级定时任务与定时唤起能力 Story

**类型**：docs
**影响模块**：`docs/specs/epic-OS/story-OS.16/README.md`, `docs/specs/epic-OS/story-OS.16/test-plan.md`, `docs/specs/epic-OS/README.md`, `docs/index.md`
**摘要**：为 Epic OS 新增 Story OS.16，定义系统级定时任务能力，覆盖一次性、间隔和 cron 触发，支持定时唤起 Agent、Skill 和系统动作，并明确持久化目录、工作目录边界、安全约束、UI 管理入口、测试计划和验收标准。

## 2026-07-07 — feat：实现系统级定时任务核心能力

**类型**：feat
**影响模块**：`packages/core/src/modules/scheduler`, `packages/core/src/lib/integrations/pi-agent/tools/schedule-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/index.ts`, `packages/core/src/lib/integrations/pi-agent/tools/system-tools.ts`, `packages/core/src/lib/integrations/pi-agent/types.ts`, `packages/web/src/modules/scheduler/__tests__/scheduler-service.test.ts`
**摘要**：新增 Schedule Service、JSON 持久化、运行日志、到期任务扫描和受控 system-tool 执行器。Pi Agent 工具箱只暴露 `schedule_task` 和 `run_schedule_now` 两个工具，系统工具必须显式声明 `schedulable` 并通过 schema/权限校验后才能被定时任务调用。

## 2026-07-07 — feat：新增定时任务状态栏 UI 入口

**类型**：feat
**影响模块**：`packages/core/package.json`, `packages/web/src/components/os/StatusBar/index.tsx`, `packages/web/src/components/os/schedules`, `packages/web/src/app/api/schedules`
**摘要**：在桌面右上角状态栏新增定时任务图标入口，点击后打开独立定时任务对话框。新增 `/api/schedules` 与 `/api/schedules/{id}/run` 服务端入口，支持查看、创建和立即运行定时任务，避免把文件系统调度逻辑放进设置弹窗或客户端组件。

## 2026-07-07 — feat：定时任务创建支持能力类型配置

**类型**：feat
**影响模块**：`packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：定时任务对话框打开后优先展示任务列表，新建表单改为按需展开。创建任务时可配置定时调用能力类型：启动角色、启动技能、系统通知或系统工具，并按类型选择角色/技能或填写提示词/通知内容。

## 2026-07-07 — feat：定时任务 UI 支持周期触发配置

**类型**：feat
**影响模块**：`packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：定时任务创建表单新增触发类型选择，支持一次性时间、固定间隔和 Cron 表达式。任务列表展示触发周期与下一次运行时间，避免只能选择单个日期时间。

## 2026-07-07 — fix：定时任务立即运行增加可见反馈

**类型**：fix
**影响模块**：`packages/core/src/modules/scheduler/action-runner.ts`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：修复点击定时任务“立即运行”后缺少可见反馈的问题。系统通知任务现在会写入通知中心；角色/技能任务在完整唤起链路接入前会生成待唤起通知；UI 显示运行成功或失败消息。

## 2026-07-07 — feat：桌面版支持系统级通知

**类型**：feat
**影响模块**：`packages/desktop/src/main/main.ts`, `packages/desktop/src/main/ipc-protocol.ts`, `packages/desktop/src/main/services/misc-service.ts`, `packages/core/src/lib/integrations/electron/ipc-protocol.ts`, `packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/web/src/app/page.tsx`, `packages/web/src/components/os/notification/SystemNotificationToastHost.tsx`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：新增 `notification:show` Electron IPC，由桌面主进程调用系统原生 Notification，并保留通知对象引用直到关闭。桌面启动时设置应用名与 Windows app user model id；主进程等待 `show/failed` 事件后返回实际投递结果，并在 macOS 原生投递失败或超时时通过 `osascript display notification` 做系统级 fallback。Web 侧新增统一 `showSystemNotification` helper 并补齐 core services 子路径导出，桌面版走 IPC，浏览器版走 Web Notification fallback；系统通知成功后会同步派发应用内全局 toast，在 macOS 系统横幅自动消失时仍保留 12 秒可见提示。

## 2026-07-07 — fix：修复定时任务运行后的 Electron IPC undefined 参数错误

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/core/src/lib/integrations/electron/services/misc.js`, `packages/core/src/lib/integrations/electron/services/misc.d.ts`, `packages/core/src/lib/integrations/electron/ipc-protocol.js`, `packages/core/src/lib/integrations/electron/ipc-protocol.d.ts`, `packages/desktop/src/main/preload.ts`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`, `packages/web/src/modules/scheduler/__tests__/electron-notification-ipc.test.ts`
**摘要**：修复桌面版运行定时任务后刷新通知中心时向 `ipcRenderer.invoke` 传入 `undefined`，导致 Electron 报 `Error processing argument at index 1` 的问题。通知列表 IPC 现在使用空对象作为默认参数，系统级通知 IPC payload 会剔除未定义字段；同步修复同目录旧 `.js/.d.ts` 产物，避免运行时解析到旧逻辑；preload IPC 桥增加兜底参数清洗，避免任意 renderer 调用把 `undefined` 传入 Electron；新增 IPC 单测覆盖定时任务通知链路。

## 2026-07-08 — fix：修复桌面打包 standalone 资源输出配置

**类型**：fix
**影响模块**：`packages/web/next.config.mjs`, `release/`
**摘要**：修复 Next.js 打包时 `outputFileTracingRoot` 放在顶层导致配置不生效、`packages/web/.next/standalone` 未生成的问题。该配置已移动到 `experimental.outputFileTracingRoot`，桌面 DMG 打包时可以正确复制 web standalone 资源；在缺少 Developer ID 证书时，已通过跳过签名/公证生成本地验证用未签名 DMG。

## 2026-07-08 — feat：系统通知支持显式配置点击唤起目标

**类型**：feat
**影响模块**：`packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：定时任务的新建表单中，系统通知动作新增“点击后”配置，可选择仅通知、打开项目、启动角色或启动技能。配置会持久化到通知任务的 `activationTarget`，桌面系统通知和应用内全局通知点击时统一按目标唤起。

## 2026-07-08 — fix：移除 macOS 系统通知 AppleScript 降级路径

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/misc-service.ts`
**摘要**：移除系统通知的 `osascript display notification` 降级逻辑，避免 macOS 将通知归属到脚本宿主并导致点击无法回调 OriginOS。桌面通知现在只使用 Electron 原生 Notification；若 `show` 事件超时但未失败，则保留通知对象并按原生通知已投递处理，以继续支持通知点击唤起项目、角色或技能。

## 2026-07-08 — fix：桌面端新增启动期落盘日志

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`
**摘要**：桌面主进程新增 `desktop.log` 捕获，覆盖启动期 `console.log/warn/error`、`uncaughtException` 和 `unhandledRejection`，用于定位 Windows exe 双击秒退等早期启动失败。日志写入 Electron `app.getPath('logs')` 目录，与现有 `llm.log` 分开保存。

## 2026-07-08 — fix：Windows 包实体化 Next standalone 依赖

**类型**：fix
**影响模块**：`packages/desktop/package.json`, `packages/desktop/electron-builder.yml`, `packages/desktop/scripts/prepare-web-standalone.js`
**摘要**：修复 Windows 安装包启动时报 `resources/web/packages/web/node_modules/next` 中 `../../../node_modules...` 触发 `Unexpected token '.'` 的问题。桌面打包前现在会清理旧 `.next`、复制 Next standalone 到 `.packaging/web-standalone`，并递归展开 pnpm symlink，electron-builder 改为从该 staging 目录复制 web 资源。

## 2026-07-08 — fix：macOS 包补齐 Next standalone 运行依赖

**类型**：fix
**影响模块**：`packages/desktop/scripts/prepare-web-standalone.js`, `release/`
**摘要**：修复 macOS 包启动内置 Next renderer 时缺少 `styled-jsx/package.json` 导致秒退的问题。standalone staging 现在会把 pnpm store 中的运行依赖补齐到 `packages/web/node_modules` 解析路径下，并保持 web 资源目录无 symlink。

## 2026-07-08 — fix：系统通知成功时不再显示主界面通知

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/core/src/lib/integrations/electron/services/misc.js`, `packages/core/src/lib/integrations/electron/services/misc.d.ts`, `packages/web/src/modules/scheduler/__tests__/electron-notification-ipc.test.ts`
**摘要**：修复 Electron 原生系统通知成功后仍派发应用内 `originos:system-notification` toast，导致用户看到主界面通知而非纯系统通知的问题。现在只有原生系统通知失败并进入浏览器/应用内 fallback，或非 Electron 浏览器场景，才显示主界面 fallback 通知。

## 2026-07-08 — fix：系统通知超时不再误报成功

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/misc-service.ts`, `packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/core/src/lib/integrations/electron/services/misc.d.ts`
**摘要**：修复 Electron 原生通知 `show` 事件超时时被当作已投递的问题，避免 UI 显示系统通知已触发但系统层实际无通知。主进程现在会记录 `[notification]` 诊断日志，并在超时、失败、不支持时返回明确 reason，由前端进入 fallback 或提示未显示。

## 2026-07-08 — fix：增强桌面系统通知可见性与诊断

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`, `packages/desktop/src/main/services/misc-service.ts`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：macOS 包新增 `NSUserNotificationAlertStyle=alert`，桌面通知创建时显式设置 urgency、timeoutType 和 macOS sound，并在前台投递时触发 dock bounce。通知 IPC 返回值新增 platform、focused、permission、nativeSupported 等诊断字段，定时任务面板在系统通知未显示时直接展示失败原因，便于区分系统权限、前台抑制和 Electron 原生通知失败。

## 2026-07-08 — fix：修复生产包图片上传 IPC 二进制传输

**类型**：fix
**影响模块**：`packages/web/src/lib/hooks/use-file-upload.ts`, `packages/desktop/src/main/services/workspace-service.ts`, `packages/core/src/lib/integrations/electron/ipc-protocol.ts`, `packages/core/src/lib/integrations/electron/ipc-protocol.d.ts`
**摘要**：修复生产打包后上传图片时 Electron IPC 将 `ArrayBuffer` 结构化克隆为普通对象，导致主进程 `Buffer.from(file.content)` 报 “The first argument must be of type string or an instance of Buffer...” 的问题。上传链路改为 renderer 传 base64 字符串，主进程按 encoding 解码，同时兼容旧 ArrayBuffer/TypedArray payload 并提供明确错误信息。

## 2026-07-08 — fix：修复协作 Agent Worker 开发态动态导入

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mjs`
**摘要**：修复多 Agent 协作 supervisor worker 在开发态执行 `runtimeImport("lib/...")` 时被 Node 当作 npm 包 `lib` 解析，导致 “Cannot find package 'lib' imported from agent-worker.mts” 的问题。worker 现在会在开发态将模块路径解析到 `packages/core/src` 下的真实 file URL，打包态仍解析到 extraResources/app.asar 中的产物。

## 2026-07-08 — fix：系统通知权限拒绝提示

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/misc-service.ts`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：当 Electron 原生通知返回 “Notifications are not allowed for this application” 时，主进程现在将失败原因规范为 `PERMISSION_DENIED`。定时任务面板会明确提示用户在系统设置中允许 OriginOS CE 通知，避免把系统权限拒绝误判为通知模块未触发。

## 2026-07-08 — fix：生产包内置 Web 服务使用可写数据目录

**类型**：fix
**影响模块**：`packages/desktop/src/main/main.ts`
**摘要**：修复生产包进入定时任务时报 `ENOENT: mkdir .../Contents/Resources/web/data` 的问题。桌面主进程启动内置 Next standalone server 时现在显式注入 `DATA_ROOT={userData}/data` 和 `MONOREPO_ROOT={resourcesPath}`，并提前创建可写数据目录，避免 Web 服务回退到只读的 app Resources 目录。

## 2026-07-09 — fix：桌面端系统通知失败时不再使用应用内通知兜底

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/core/src/lib/integrations/electron/services/misc.js`, `packages/web/src/modules/scheduler/__tests__/electron-notification-ipc.test.ts`
**摘要**：修复桌面端 Electron 原生系统通知失败后自动 fallback 到浏览器/应用内通知，导致用户只看到 OriginOS 主界面通知的问题。Electron 环境现在只接受真正的操作系统通知；若系统权限拒绝或投递失败，直接返回 `PERMISSION_DENIED/FAILED/SHOW_EVENT_TIMEOUT`，不再显示应用内通知冒充系统通知。

## 2026-07-09 — fix：未公证 mac 包使用 ad-hoc 签名绑定 Bundle ID

**类型**：fix
**影响模块**：`packages/desktop/scripts/create-mac-dmg.js`, `release/`
**摘要**：修复未签名 mac 包 `codesign` identifier 显示为 `Electron`、Info.plist 未绑定，导致 macOS 通知设置中找不到 OriginOS CE 的问题。DMG 生成脚本现在在创建镜像前对 `.app` 执行 ad-hoc 签名，使 bundle identifier 正确为 `com.originos.ce`，便于系统通知权限登记。

## 2026-07-09 — feat：定时任务支持编辑和删除

**类型**：feat
**影响模块**：`packages/web/src/app/api/schedules/[id]/route.ts`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：定时任务详情 API 新增 `PATCH` 更新能力，面板列表新增编辑和删除入口。编辑会复用任务表单并回填触发周期、动作类型、通知点击目标等配置；删除成功后刷新列表并清理当前编辑态。

## 2026-07-09 — feat：系统通知点击目标支持启动指令

**类型**：feat
**影响模块**：`packages/core/src/lib/integrations/electron/services/misc.ts`, `packages/web/src/components/os/schedules/ScheduleDialog.tsx`, `packages/web/src/app/page.tsx`, `packages/web/src/components/os/agent-dialog/AgentDialogContent.tsx`
**摘要**：系统通知点击目标新增可选启动指令，定时任务面板在打开项目、启动角色或启动技能时可配置一条默认发送的消息。点击系统通知后会打开对应 project/agent/skill 窗体，并在 Agent/Skill 会话初始化完成后自动发送该指令。

## 2026-07-09 — feat：通知栏通知支持点击触发动作

**类型**：feat
**影响模块**：`packages/web/src/components/os/notification/NotificationPanel.tsx`, `packages/web/src/store/notificationStore.ts`, `packages/web/src/app/page.tsx`
**摘要**：小铃铛通知栏中的通知项现在会解析通知 payload 中的 `activationTarget` 或定时任务 action，点击后复用系统通知点击逻辑打开项目、角色或技能并发送启动指令。通知项点击后会自动标记为已读，关闭按钮仍只负责忽略通知。

## 2026-07-09 — fix：优化 Patterns.md 经验模式摘要

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/cognitive/pattern/extractor.ts`, `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/renderer.ts`, `packages/core/src/lib/integrations/pi-agent/cognitive/pattern/__tests__/renderer.test.ts`
**摘要**：修复经验模式渲染时把工具调用原始 JSON 片段直接写入 `Patterns.md`，导致内容截断且难读的问题。Pattern 渲染器现在只收集原始实践样本作为上下文，由 Agent/LLM 负责总结成“最佳实践 / 反模式 / 反思记录”；代码不再用正则或字符串规则生成经验正文。

## 2026-07-10 — feat：桌面主进程接管定时任务后台调度

**类型**：feat
**影响模块**：`packages/desktop/src/main/main.ts`, `packages/desktop/src/main/services/desktop-scheduler-service.ts`, `packages/desktop/src/main/services/native-notification-service.ts`, `packages/desktop/src/main/services/misc-service.ts`
**摘要**：新增桌面主进程后台调度服务，应用启动后立即扫描一次到期定时任务，并每 30 秒调用 `SchedulerService.runDueTasks()` 执行后续到期任务。系统通知动作现在由主进程直接调用 Electron 原生 Notification，点击仍复用统一唤起逻辑；服务会避免并发重复扫描，并在应用退出前停止 timer，确保定时任务不依赖前端面板或手动“立即运行”按钮。

## 2026-07-10 — fix：修复桌面定时调度启动时 core alias 解析失败

**类型**：fix
**影响模块**：`packages/desktop/src/main/services/desktop-scheduler-service.ts`
**摘要**：修复桌面主进程启动时报 `Cannot find module '@originos/core/modules/scheduler'` 的问题。主进程运行时不能解析 TypeScript path alias，定时调度服务已改为与其他 desktop service 一致的相对路径导入，编译后会指向 `dist-electron/core/src` 下的实际产物。

## 2026-07-10 — fix：定时任务面板提示条自动消失

**类型**：fix
**影响模块**：`packages/web/src/components/os/schedules/ScheduleDialog.tsx`
**摘要**：修复定时任务面板底部成功/错误提示条不会自动消失的问题。面板打开时会清理旧提示，成功提示 4.5 秒后自动关闭，错误提示 8 秒后自动关闭，避免状态栏长期遮挡列表内容。

## 2026-07-10 — fix：修复 Windows 包遗漏编译后 Agent 工具资源

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`
**摘要**：修复 agent-worker extraResources 从源码目录复制 `*.js`，导致新增的 TypeScript 工具未进入 Windows 打包资源的问题。打包配置现在从 `packages/desktop/dist-electron/core/src/lib/integrations/pi-agent/tools` 复制编译后的工具文件，确保 `schedule-tools.js` 等新增系统工具随包发布。

## 2026-07-10 — fix：Windows 安装器改为向导式安装

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`
**摘要**：修复 Windows one-click 安装器在解压大量 web standalone 资源时进度反馈不足、用户侧容易误判为无响应的问题。NSIS 安装器改为向导式安装，允许选择安装目录，并禁用安装完成后自动启动应用，便于区分安装过程和应用启动问题。

## 2026-07-10 — fix：Windows 发布新增 zip 包并调整 NSIS 解包方式

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`
**摘要**：修复 Windows NSIS 安装器解压 800M+ 资源时仍可能被系统标记为“安装程序没有响应”的问题。Windows 发布现在同时输出 zip 包，供用户直接解压运行；NSIS 安装器启用 `useZip`，降低 7z 解包阶段 UI 长时间无响应的概率。

## 2026-07-10 — fix：新增 Windows 短路径 zip 产物

**类型**：fix
**影响模块**：`release/OriginOS CE-0.1.10-x64-shortpath.zip`
**摘要**：修复普通 Windows zip 包包含 pnpm `.pnpm` 长路径，用户解压到桌面或下载目录时可能触发 Windows 路径长度限制的问题。新增短路径 zip 产物，移除重复的根部 pnpm store，只保留实体化的 `packages/web/node_modules` 运行依赖，最长包内路径降至 164 字符。

## 2026-07-10 — fix：Windows 包校验覆盖 app.asar 内部工具

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`, `packages/desktop/scripts/verify-windows-package.js`, `packages/desktop/package.json`
**摘要**：修复 Windows 解压包启动时报 `Cannot find './tools/loop-detector'` 的问题，打包配置现在显式将编译后的 Pi Agent tools 放入 `app.asar`。新增 `pnpm --filter @originos/desktop verify:win-package` 校验脚本，自动检查 `app.asar`、agent-worker 外部资源和短路径 zip 中的关键运行文件。

## 2026-07-10 — fix：Windows zip 默认改为短路径产物

**类型**：fix
**影响模块**：`packages/desktop/scripts/prepare-web-standalone.js`, `packages/desktop/scripts/verify-windows-package.js`
**摘要**：Windows zip 不再依赖额外的 `-shortpath.zip` 手工产物。`dist:win` 会在 Web standalone 准备阶段启用 `ORIGINOS_WINDOWS_SHORT_ZIP=1`，实体化运行依赖后移除冗余的根部 `.pnpm` store，使 electron-builder 默认输出的 `OriginOS CE-<version>-x64.zip` 就是短路径 zip；mac 打包流程不设置该变量，继续保留原 standalone 结构。

## 2026-07-10 — fix：工具执行路径屏蔽操作系统差异

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/path-utils.ts`, `packages/core/src/lib/integrations/pi-agent/tools/file-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/document-tools.ts`, `packages/core/src/lib/integrations/pi-agent/tools/__tests__/working-directory.test.ts`
**摘要**：修复 Windows 上创建 Agent/RoleAgent/Skill 时路径混用反斜杠和 `data/...` 相对路径，导致文件写入到错误目录的问题。工具层现在统一识别 `data/agents/...`、`data/skills/...` 为 `DATA_ROOT` 下的路径，执行时使用系统原生路径，返回给 Agent/记忆的路径统一为 POSIX 风格展示路径。

## 2026-07-13 — refactor：清理 core 源码目录编译产物

**类型**：refactor
**影响模块**：`packages/core/src`, `packages/core/tsconfig.json`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`, `packages/desktop/tsconfig.json`, `packages/desktop/electron-builder.yml`, `packages/desktop/scripts/verify-agent-worker-runtime.js`
**摘要**：清理 `packages/core/src` 中历史遗留的 `.js/.d.ts/.map` 编译产物，避免运行时误加载旧 JS 覆盖 TS 源码修复。core 独立编译输出改到 `dist/core`，agent-worker 开发态只解析 TS/MTS 源文件，desktop build 负责生成编译后的 worker 入口，桌面打包和校验脚本都改为使用 `dist-electron` 编译产物。

## 2026-07-13 — fix：附件上传后可再次选择文件

**类型**：fix
**影响模块**：`packages/web/src/lib/hooks/use-file-upload.ts`, `packages/core/src/lib/hooks/use-file-upload.ts`, `packages/web/src/components/skills/SkillDialog.tsx`
**摘要**：修复附件按钮完成一次上传后再次点击无效的问题。上传 hook 现在维护一个常驻隐藏文件选择框，每次点击前重置 input value，选择后立即快照文件列表，组件卸载时统一清理节点；技能窗口不再在上传成功后删除技能内容缓存，并使用当前技能工作目录兜底计算上传目录，避免第二次点击时 basePath 为空直接返回。core/web 两份上传 hook 统一使用 base64 payload，避免 Electron IPC 序列化 ArrayBuffer 后导致生产上传失败。

## 2026-07-13 — fix：桌面包补齐 core paths 运行模块

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`, `packages/desktop/scripts/verify-windows-package.js`, `packages/desktop/scripts/verify-asar-relative-requires.js`, `packages/desktop/package.json`
**摘要**：修复打包后启动时报 `Cannot find module '../../../core/src/lib/paths'` 和后续 core 相对依赖缺失的问题。桌面包现在将 `dist-electron/core/src/lib`、`modules`、`types` 下的运行时 JS/MJS 产物完整放入 `app.asar`；新增 `verify:asar-requires` 递归扫描主进程与 core runtime 的相对 `require()`，Windows 包校验会自动执行该检查，避免依赖遗漏靠用户逐个发现。

## 2026-07-14 — fix：Windows NSIS 安装器关闭 zip 解包模式

**类型**：fix
**影响模块**：`packages/desktop/electron-builder.yml`
**摘要**：修复 Windows 安装 exe 时报 `failed to decompress files, try running the installer again, error opening zip file` 的问题。NSIS 安装器不再启用 `useZip`，避免安装阶段依赖内嵌 zip 解包路径；Windows zip 产物仍保留用于免安装分发和短路径校验。

## 2026-07-15 — feat：标准化桌面端七牛发布流程

**类型**：feat
**影响模块**：`packages/desktop/scripts/release-qiniu.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/verify-mac-signing.js`, `packages/desktop/package.json`, `package.json`
**摘要**：新增统一发布入口 `release-qiniu.js`，串联版本更新、应用构建、Electron 签名打包、macOS 签名校验、七牛上传和官网发布接口通知。脚本会自动规范化 `CSC_NAME` 中的 Developer ID 前缀，并支持 `--skip-bump`、`--publish-existing` 复用已更新版本或已生成产物继续发布；七牛上传支持 `QINIU_RESUME_EXISTING=1` 跳过已上传的不可变产物，macOS 验签兼容新版 `codesign` 输出中的 `Signature size`/`Authority=(unavailable)` 形态，避免失败重试时误升版本或重复打包。

## 2026-07-17 — feat：发布通知附带版本更新说明

**类型**：feat
**影响模块**：`packages/desktop/scripts/release-notes.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/notify-release-service.js`, `docs/changes/releases/v0.1.14/changelog.md`
**摘要**：发布流程新增版本更新说明生成器，优先读取 `docs/changes/releases/v<version>/changelog.md` 版本归档，并生成结构化 changelog、Markdown release notes 和摘要。七牛发布后的官网接口通知以及独立通知脚本都会携带 `release_summary`、`release_notes`、`changelog` 字段，便于官网展示每个版本的更新内容。

## 2026-07-17 — docs：变更记录按版本目录归档

**类型**：docs
**影响模块**：`AGENTS.md`, `CLAUDE.md`, `docs/changes/releases/README.md`, `docs/changes/releases/v0.1.14/changelog.md`
**摘要**：架构围栏中的变更管理规则改为“全量流水 + 版本目录归档”双轨制。每次变更除更新 `docs/changes/changelog.md` 外，还必须维护当前发布版本目录 `docs/changes/releases/v<version>/changelog.md`，目录名必须携带版本号。

## 2026-07-17 — fix：过滤 Pi Agent 用户可见消息中的思考内容

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/display-content.ts`, `packages/core/src/lib/integrations/pi-agent/message.ts`, `packages/core/src/lib/features/skills/service.ts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`, `packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`
**摘要**：修复部分模型只返回 thinking block 或在 text 中混入 `<think>`/`<thinking>` 标签时，Pi Agent 会把思考内容当作正文展示的问题。用户可见的消息提取现在只使用 text block，并清理 provider thinking 标签；thinking fallback 保留为显式兼容能力但不再用于生产展示链路。

## 2026-07-17 — docs：Epic/Story 实施增加测试闭环规约

**类型**：docs
**影响模块**：`AGENTS.md`, `CLAUDE.md`, `docs/changes/releases/v0.1.14/changelog.md`
**摘要**：架构围栏新增 Epic/Story 测试闭环要求：实施 Story 前必须确认或补齐功能测试 case，功能完成后必须创建自动化测试验证 goal，且 goal 目标明确为通过该 Story 的测试 case。实施检查清单同步加入测试 case 前置检查、实现对齐和完成后 goal 验证项。

## 2026-07-17 — fix：修复 Windows 打包版技能工作目录解析错误

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/bash-tools.ts`, `packages/desktop/src/main/main.ts`, `packages/web/src/components/skills/SkillDialog.tsx`
**摘要**：修复 Windows 打包版打开内置技能时工作目录显示为 `/workspace`、输出目录未设置的问题。根因是 bash 工具缺少 Windows 平台支持，导致回退到 Git Bash 时 MSYS 路径转换异常且 HOME 环境变量未设置。新增 `isWindowsPlatform()` 和 `buildShellInvocation()` 支持 PowerShell/cmd 原生执行；Electron 主进程显式注入 HOME 环境变量；SkillDialog 在 outputDir 等于 workDir 时仍注入路径兜底。

## 2026-07-20 — fix：Anthropic Bearer 流式调用补齐 options 凭证

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`, `packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`
**摘要**：修复 Anthropic 风格 API 使用 bearer/authToken 时 `streamSimple` 读不到凭证，导致请求在创建 stream 前同步失败、界面只看到 user message_end 而没有 assistant 返回的问题。Bearer 分支现在只通过 `options.apiKey` 和 Authorization header 传递 token，不再把运行时凭证写入 `streamModel`，并让调试 stream hook 兼容无 `push/end` 的测试 stream。

## 2026-07-20 — docs：架构围栏升级为 workspace 项目地图并补充 Story 模板约束

**类型**：docs
**影响模块**：`AGENTS.md`, `docs/changes/releases/v0.1.15/changelog.md`
**摘要**：AGENTS.md 升级到 v2.3.0，项目结构从旧单体 `src/` 地图更新为 `packages/web`、`packages/core`、`packages/desktop`、`packages/agent`、`packages/service` 的 pnpm workspace 地图。集成架构章节只保留当前已落地的 Pi Agent / RoleAgent / Project Agent / 认知系统，新增 Epic/Story 模板强制约束，要求新建和实施 Story 时完整使用 `docs/templates/story-spec-template/` 六件套、清空模板占位符、同步 Epic 状态并记录测试闭环。

## 2026-07-29 — docs：Story 实施增加独立分支与 Worktree 隔离规约

**类型**：docs
**影响模块**：`AGENTS.md`, `docs/changes/changelog.md`, `docs/changes/releases/v0.1.45/changelog.md`
**摘要**：AGENTS.md 升级到 v2.4.0。每个 Story 必须从最新 `dev` 创建独立的 `story/{story-id}-{short-slug}` 分支，并在独立 worktree 中实施、测试和提交；不同 Story 禁止共用分支、worktree、提交或 PR。验证和审查通过后统一合并到 `dev`，再清理对应 worktree。共享前置能力必须先拆成独立 Story 合并，紧急例外需明确批准并记录补偿措施。

## 2026-07-29 — docs：实施隔离边界调整为 OpenSpec Proposal

**类型**：docs
**影响模块**：`AGENTS.md`, `docs/changes/changelog.md`, `docs/changes/releases/v0.1.45/changelog.md`
**摘要**：AGENTS.md 升级到 v2.5.0。Story 继续作为需求和验收边界，但不再直接对应 Git 分支；Story 中每个可独立交付的 Task 必须一对一创建并审批 OpenSpec Proposal。Proposal 使用独立集成分支和主 worktree，应用源码必须由 subagents 在互相隔离的 Task 分支/worktree 中实施；Proposal 主 worktree 仅负责规格、编排、集成和总体验证。完成后 Task 分支先合并回 Proposal 分支，通过完整测试、OpenSpec strict validation 和 Story 验证 goal 后再合并到 `dev`。

## 2026-07-29 — docs：OpenSpec 初始化配置对齐 1.4.x Schema Workflow

**类型**：docs
**影响模块**：`AGENTS.md`, `openspec/config.yaml`, `.codex/skills/openspec-*`, `docs/changes/changelog.md`, `docs/changes/releases/v0.1.45/changelog.md`
**摘要**：确认 OpenSpec 1.4.1 初始化采用 `openspec/config.yaml` 和生成式 agent skills，不再强制依赖旧版 `openspec/AGENTS.md`、`project.md`。AGENTS.md 升级到 v2.5.1，并要求使用 CLI 返回的 planning/artifact 路径。`openspec/config.yaml` 补充 OriginOS 技术栈、依赖围栏、Story Task 与 Proposal 一对一追踪规则，以及 Proposal、Specs、Design、Tasks 的 subagent/worktree、测试和 Evidence 门禁。

## 2026-08-05 — fix：修复项目访谈误恢复与技能依赖缺失

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/`, `packages/desktop/src/main/services/`, `packages/web/src/app/api/agent/projects/`, `packages/web/src/app/api/projects/`, `templates/project-interview/`, `templates/skills/domain-discovery/`
**摘要**：项目访谈 Agent 现显式关闭面向自主任务的 CompletionGuard，避免正常追问被判定为未完成并覆盖有效回复。项目初始化和启动统一从打包内置技能源幂等补齐完整技能目录，业务模型未创建按正常 Phase 1 处理，同时保证历史压缩不产生孤立 tool result。

## 2026-08-05 — ci：移除未使用的通用 GitHub Actions CI

**类型**：ci
**影响模块**：`.github/workflows/ci.yml`
**摘要**：移除 push/pull_request 自动触发但当前不再使用的通用 CI workflow；桌面发布 workflow 保持不变。
