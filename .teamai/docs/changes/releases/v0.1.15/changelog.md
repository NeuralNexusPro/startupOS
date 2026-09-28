# v0.1.15 Changelog

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

## 2026-07-20 — fix：Anthropic Bearer 流式调用补齐 options 凭证

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`, `packages/core/src/lib/integrations/pi-agent/core/__tests__/agent.test.ts`
**摘要**：修复 Anthropic 风格 API 使用 bearer/authToken 时 `streamSimple` 读不到凭证，导致请求在创建 stream 前同步失败、界面只看到 user message_end 而没有 assistant 返回的问题。Bearer 分支现在只通过 `options.apiKey` 和 Authorization header 传递 token，不再把运行时凭证写入 `streamModel`，并让调试 stream hook 兼容无 `push/end` 的测试 stream。

## 2026-07-20 — docs：架构围栏升级为 workspace 项目地图并补充 Story 模板约束

**类型**：docs
**影响模块**：`AGENTS.md`, `docs/changes/releases/v0.1.15/changelog.md`
**摘要**：AGENTS.md 升级到 v2.3.0，项目结构从旧单体 `src/` 地图更新为 `packages/web`、`packages/core`、`packages/desktop`、`packages/agent`、`packages/service` 的 pnpm workspace 地图。集成架构章节只保留当前已落地的 Pi Agent / RoleAgent / Project Agent / 认知系统，新增 Epic/Story 模板强制约束，要求新建和实施 Story 时完整使用 `docs/templates/story-spec-template/` 六件套、清空模板占位符、同步 Epic 状态并记录测试闭环。
