# Changelog - v0.4.1

本版本包含 v0.4.0 的全部功能与修复，并补充以下改动。

## 2026-10-08 — fix：桌面发布校验在成功后无法退出

**类型**：fix
**影响模块**：`packages/desktop/scripts/verify-mac-package.js`、`verify-windows-package.js`、`verify-ontology-runtime.js`
**摘要**：macOS 包校验完成并打印成功日志后，已加载的运行时模块仍保留活动句柄，导致 Actions 步骤持续等待。现在包校验在清理临时解包目录后显式返回校验退出码；Windows 包校验采用相同收尾方式。本体运行时校验在成功和失败时均先清理再退出，并在冻结 WorkItem 未完成时输出运行状态与尝试原因，便于定位 Windows 构建失败。

---

## 2026-10-08 — fix：智能决策模式支持选择感知源

**类型**：fix
**影响模块**：感知中心规则配置
**摘要**：智能决策模式可选择具体感知源，避免多个同平台连接的规则配置互相影响。

---


## 2026-10-08 — perf：会话列表索引 sidecar 消除打开窗口时的主进程同步阻塞

**类型**：perf
**影响模块**：`packages/core/src/lib/features/agent/session-service.ts`、`packages/core/src/lib/storage/json-store.ts`
**摘要**：Windows 用户反馈角色窗口打开时「未响应」。根因链：listSessions 打开窗口时对每个会话文件全量读+JSON.parse（同步 CPU，总量=全部历史 MB 数），且缺 llmConfig 的会话逐个 `readUserConfigWithProductDefaults()` 同步读 user-config.json（Windows Defender 实时扫描下每文件 +10~50ms，N 个老会话即主进程秒级阻塞）；这些全部跑在 Electron 主进程（AGENT_SESSION_LIST 为 ipcMain.handle），同步阻塞直接停掉窗口消息泵。修复：①会话元数据索引 sidecar（`{sessionsDir}/.sessions-index.json`，saveSession 唯一写入口顺手维护），listSessions 优先读索引，mtime+size 校验失配/文件增删时回退全量扫描并重建，实测 57 会话 26ms→1.3ms 且不随历史增长；②fallback 扫描的 user-config 回填提出循环（N 次同步读→1 次）；③listTaskRuntimeSessions 关闭逐会话 llmConfig 兜底；④删除 getSession 2 条 [DEBUG] console.error（即此前日志污染主源之一，57 文件×2 条/次）。session 测试 25/25（含新增 session-index 5 例）、desktop 130/130、core/desktop tsc 0 新增、web tsc 与基线相同、lint:boundaries 0 诊断、exports verify 通过。

---

## 2026-10-08 — feat：原生通知点击支持打开 http/https 链接

**类型**：feat
**影响模块**：`packages/desktop/src/main/services/native-notification-service.ts`、`packages/desktop/src/main/services/misc-service.ts`、`packages/desktop/src/main/services/desktop-scheduler-service.ts`、`packages/core/src/lib/integrations/electron/services/misc.ts`
**摘要**：原生通知点击支持打开外部链接。`NativeNotificationRequest.url` 经严格协议白名单（仅 http/https，`new URL()` 解析校验）后 `shell.openExternal` 打开系统浏览器；非法/非白名单 URL 拒绝并回退既有激活目标行为。入口覆盖：NOTIFICATION_SHOW IPC、定时任务 notify 动作 `payload.url`。新增 openNotificationUrl 测试 2/2、scheduler 回归 4/4、lint:boundaries 0 诊断。

---

## 2026-10-08 — feat：大模型配置支持思考模式开关与思考强度配置

**类型**：feat
**影响模块**：`packages/core/src/lib/integrations/pi-agent/llm-config.ts`、`packages/core/src/lib/integrations/pi-agent/core/agent-factory.ts`、`packages/core/src/lib/integrations/pi-agent/persistent-agent.ts`、`packages/core/src/lib/storage/user-config.ts`、`packages/core/src/lib/features/user-config/index.ts`、`packages/core/src/lib/integrations/electron/services/misc.ts`、`packages/web/src/store/settingsStore.ts`、`packages/web/src/components/os/settings/SettingsDialog.tsx`
**摘要**：大模型设置新增「思考模式」配置（关闭/最小/低/中/高）。`RuntimeLLMConfig.thinkingLevel` 贯通 RuntimeLLMConfig → UserLLMConfig 持久化 → settingsStore 往返 → 设置弹窗五档选择器 → createOriginOSAgent（显式参数 > llmConfig > 默认 low）→ PersistentAgent.applyLLMConfig 热更新同步 setThinkingLevel；非法值在 normalize 阶段丢弃；非推理模型仍由 model.reasoning === false 强制降为 off。user-config 测试 12/12、回归 9/9、lint:boundaries 0 诊断、exports verify 通过。

---

## 2026-10-08 — fix：访谈行为草稿对可信 UI 不可见 + Working Summary 自我放大污染

**类型**：fix
**影响模块**：`packages/core/src/lib/features/agent/tools/interview-behavior-draft.ts`、`packages/core/src/lib/features/agent/tools/interview-ontology-sync.ts`、`packages/core/src/lib/features/project/interview-behavior-draft-service.ts`、`packages/core/src/lib/integrations/pi-agent/persistent-agent.ts`、`packages/core/src/lib/integrations/pi-agent/runtime-working-summary.ts`
**摘要**：两个根因。其一，三个访谈工具的 sourceId 由模型传参决定，模型猜测 `persistent-proj-…` 而 UI 查询 `project-initialization-…`/`project-…`，reviewLatest 严格匹配永远 DRAFT_NOT_FOUND，「行动草稿审阅」卡片从未渲染（实测 SQE 项目已生成 5 Action/2 FactType/2 State/6 Transition/3 Rule 的草稿但用户不可见）；修复为工具上下文注入可信 sourceId + reviewLatest 回退项目最新非 discarded 草稿。其二，合成 [Working Summary] system 消息被 agent_end 全量持久化，下一轮 summary 倒序扫描先命中它再次包裹「禁止重复动作：」前缀逐轮累积（实测 ×7）；greeting 触发指令的「不要重复已确认的内容」也被误捕；修复为 summary 跳过 system 角色与「系统启动触发」前缀消息、持久化过滤 system 合成消息。core tsc 0 新增错误、受影响测试 17/17 通过、pi-agent 12 个失败与 solution-design-source 1 失败经 stash 对照确认为存量基线、lint:boundaries 0 诊断。

---

## 2026-10-08 — fix：访谈恢复时前端出现两个 loading 指示器

**类型**：fix
**影响模块**：`packages/web/src/components/interview/InterviewWindow.tsx`、`packages/web/src/components/ui/chat/ChatMessageList.tsx`
**摘要**：访谈恢复（needsBehaviorModeling 路径触发 greeting）时同时渲染两个 loading：InterviewWindow 的 messages useMemo 未透传 isStreaming，triggerGreeting 占位消息丢失流式标记，ChatMessageList 的 hasStreamingMsg 判定失效，StreamingDots 与「正在处理...」占位气泡同时命中；且 ChatMessageList 内两个指示器条件本身不互斥（isThinking && !hasStreamingMsg 与 isThinking && 空 content 非流式 assistant 末尾消息可同时为真）。修复：透传 isStreaming（对齐 SkillDialog/AgentDialogContent），提取 showProcessingPlaceholder 使两个指示器互斥。web tsc 无新增错误、eslint 0 error。

---

## 2026-10-05 — fix：electron 门面剔除 workspace-paths，修复浏览器端 `require is not defined`

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/electron/index.ts`
**摘要**：AG.9 引入的 electron 门面（barrel index.ts）re-export 了 workspace-paths 的 6 个运行时符号，而该文件顶层导入 `node:path`/`node:fs`；Web 客户端组件经门面引入 `isElectron` 等符号时，webpack 将 workspace-paths 一并打进浏览器 bundle，dev electron 混合渲染下以 `Uncaught ReferenceError: require is not defined (node:path)` 崩溃并触发 hydration 报错。修复：从门面移除 workspace-paths re-export（全仓 0 个消费方经门面使用这 6 个符号，web/desktop 均走深路径条目 `./lib/integrations/electron/workspace-paths`），门面头部注明原因。core/desktop/web tsc 0 error、exports verify、`lint:boundaries` 0 诊断通过。

---

## 2026-10-05 — refactor：AG.10-T7 collaboration-runtime supervisor-dag 巨型文件拆分（Story AG.10 完成）

**类型**：refactor
**影响模块**：`packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts`（2166 → 522 行）、`engine/supervisor-dag-{types,manifest,verifier,hitl,workflow,dispatch,tools}.ts`（新建 7 文件共 1828 行）、`docs/specs/epic-AG/story-AG.10/`、`openspec/changes/refactor-supervisor-dag/`
**摘要**：AG.10-T7 落地，Story AG.10（7/7 巨型文件）至此完成。engine/supervisor-dag.ts 按单一职责拆为共享类型/manifest 与拓扑构建/LLM 任务验收/HITL 路由/静态 DAG 路径/dispatch_worker 派发/协调工具分派 7 个模块文件，主文件保留 `executeSupervisorDag` 编排主体与 `executeCollaborationRuntime` 统一入口。全部 11 个公共导出符号经 re-export 原样保留、消费方 import 零改动、supervisor-dag-hitl 7 + supervisor-protocol.integration 4 全绿、collaboration-runtime 失败集与基线逐一相同（13 项既有债）、madge 12 环 = 基线且新文件零环、token 级对比 1708 条可执行行未解释 0 条（闭包状态经 SupervisorDagCtx 显式传递，纯机械变换）；主文件 522 行达标（偏差见 proposal design.md D6/D7）。

---

## 2026-10-04 — refactor：AG.10-T6 collaboration-runtime contract-execution 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts`（2611 → 800 行）、`facade/contract-execution-{types,shared,lock,ops,ledger,stages,advance}.ts`（新建 7 文件共 2196 行）、`docs/specs/epic-AG/story-AG.10/`、`openspec/changes/refactor-contract-execution/`
**摘要**：AG.10-T6 落地。facade/contract-execution.ts 按单一职责拆为类型面/共享常量与错误/文件锁/无状态运算/账本持久化/阶段提交/五阶段推进 7 个模块文件，主文件保留 `CollaborationExecutionStore` 公共 API、observers 桥接与 ctx 组装。公共导出符号集合不变（50/50）、消费方 import 零改动、facade 测试 48/48 全绿、madge 12 环 = 基线、token 级对比 60/60 方法体一致（纯机械移动）；主文件 800 行为备用上限内（偏差见 proposal design.md D7）。

---


---

## 2026-10-01 — refactor：AG.10-T5 pi-agent core agent 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`（1912→1348）、`core/{agent-internals,agent-completion,agent-factory}.ts`（新建 3 文件）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-agent-core` 实施 OriginOSAgent 主类拆分：EventEmitter + 8 个纯 helper 逐字移入 agent-internals.ts；judge/empty-stop/guard/失败报告 4 个 completion 方法按 D3 ctx 变换移入 agent-completion.ts（4 个可变字段以 getter/setter 闭包绑定主类实例保证写回）；工厂移入 agent-factory.ts 并落地 D4 传参注入（`<T>(params, ctor)` + agent.ts 尾部同名薄包装——madge 8 将 type-only import 计边，type-only 反向引用与 setter 注册两案均实测 13 环超门禁后弃用）。公共符号与消费方导入零变化。TC-1~TC-6 全过（core 失败集与基线逐一相同、store.test 20/20；双端 build 0 error；madge 12 环=基线、core/ 新文件零环；边界扫描 0 诊断；主文件 1348 ≤ 1500，新文件最大 432 ≤ 600）。token 级复核 4 方法/8 helper 逐字一致。subagent 停滞 4 次由主会话接管验证。Story AG.10 完成 5/7。

---

## 2026-09-30 — refactor：AG.10-T4 contract-bound runtime composition 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts`（1102→141）、`features/project/composition/{contract-runtime-types,contract-artifact-runtime,contract-execution-adapters,contract-task-session-adapters}.ts`（新建 4 文件）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-contract-runtime-composition` 实施 contract-bound-runtime-composition.ts 纯机械拆分：协议常量与 host/组合类型、artifact 执行运行时（helper + AgentManagerContractRuntime）、Readiness/Verifier/Outcome/HITL 执行端口适配器、Task 会话适配器（approved task 端口/evidence sink/恢复/优先级 mutation）逐字移入 `composition/` 子目录 4 文件；主文件收敛为组合根（`createProjectContractRuntimeComposition` + `projectContractRuntimeHost`）并 re-export 全部 9 个公共符号，调用方 import 零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；3 个 project 测试 15/15；wiring 2/2 + ipc 23/23；双端 build 0 error；madge 12 环=基线且 0 路径经过 composition/；主文件 141 ≤ 250，新文件最大 351 ≤ 600）。集成复核 token 级一致：组合根 2 函数 + 8 类 + 19 函数 + 2 常量全等（唯一变换为 eslint curly 单语句花括号包裹，AST diff = 0）。偏差 6 处已留痕（深路径 type import 断 madge 回边等）。Story AG.10 完成 4/7。

---

## 2026-09-30 — refactor：AG.10-T3 task-runtime coordinator 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts`（1142→689）、`task-runtime/coordinator-{types,shared,commands,controls}.ts`（新建 4 文件）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-task-coordinator` 实施 coordinator.ts 纯机械拆分：host/配置类型与错误类/模块级 helper 逐字移入 types/shared，Project metadata/Evidence/Review 命令与 pause/cancel/resume/retry 控制动作按 D3 ctx 变换外移（`this.*` → `ctx.*`，可变字段经 `bumpContinuationGeneration`/`resetRunningPromise` 访问器、`state` 经 getter/setter 保持引用语义），主类保留 host 生命周期、续跑循环编排与状态机/持久化。4 个公共符号 re-export 可导入，desktop 深路径与包内导入零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；coordinator.test 21/21；双端 build 0 error；madge 12 环=基线；coordinator.ts 689 ≤ 700，新文件最大 328 ≤ 600）。集成复核 token 级逐字一致性：28 个保留方法与 10 个外移函数体全部一致（唯一变换为访问器调用与 helper 重命名）。Story AG.10 完成 3/7。

---

## 2026-09-30 — refactor：AG.10-T2 Pi Agent 客户端 hooks 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/client-hooks.ts`（→ `client-hooks/` 7 文件）、`packages/core/package.json`（exports target 切换）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-client-hooks` 实施 client-hooks.ts 纯机械拆分：store/types/api 逐字移入，send/stream 函数体按 D3 规则外移，index.ts 承接全部公共导出，调用方零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；madge 12 环=基线）。Story AG.10 完成 2/7。

---

## 2026-09-30 — refactor：AG.10-T1 首页 page.tsx 巨型文件拆分（首个 task 完成）

**类型**：refactor
**影响模块**：`packages/web/src/app/page.tsx`（1609 → 108 行）、`packages/web/src/app/home/`（新增 5 文件）、`packages/desktop/src/main/services/perception-plugin-host/__tests__/email-provisioning.test.ts`（遗留 tsc 修复）
**摘要**：Proposal `refactor-home-page-structure` 实施首页 page.tsx 纯机械拆分：page.tsx 收敛为布局门面，展示组件/状态/handler 逐字移入 `app/home/`；导出符号与调用方 import 零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；双端 build 0 error；madge 12 环=基线；首页冒烟 200/0 error）。Story AG.10 转 In Progress，T2–T7 待实施。

---

## 2026-09-30 — refactor：AG.11 重复与死代码治理（Story AG.11 完成）

**类型**：refactor
**影响模块**：`.teamai/docs`（移出 git）、`.gitignore`、`packages/service/`（删除）、`packages/web/data/`（出库）、`knip.json`、`docs/specs/epic-AG/story-AG.11/`、`AGENTS.md`
**摘要**：Proposal `clean-redundant-docs-and-dead-code` 实施仓库卫生治理：`.teamai/docs` 868 文件移出 git（本地保留，实测零消费方）；`packages/service` 空壳删除；`packages/web/data` 61 文件出库；knip 6.38.0 基线入库（files 121 / exports 80，只记录不接 CI）。TC-1~TC-6 全过，测试基线零 delta。AGENTS.md 升 v2.6.6。

---

## 2026-09-29 — feat：AG.9 core 公共 API 收缩与定位如实化（Story AG.9 完成）

**类型**：feat
**影响模块**：`packages/core/package.json`、`scripts/expand-core-exports.cjs`、`packages/core/src/`、`packages/web/src/`、`packages/desktop/src/`、`packages/core/README.md`、`AGENTS.md`、`docs/specs/epic-AG/story-AG.9/`、`openspec/`（spec `core-exports-whitelist` 新增）
**摘要**：Proposal `govern-core-public-api`（已归档）实施 core 公共 API 收缩：exports 74 条/52 通配 → 132 条显式 / 0 通配（新增 `expand-core-exports.cjs --verify` 门禁）；新建 electron 门面并迁移 electron/culture/pi-agent-task-runtime 热点深路径导入；删除 11 个 jsx 副本与 web 壳 4 文件；`packages/core/README.md` 定位如实化（共享 TS 运行时，exports 白名单即公共 API）。TC-1~TC-7 全过，测试基线零 delta。合并哈希 36d55cc；AGENTS.md 升 v2.6.5（新增 core exports 白名单条款）。


## 2026-09-28 — docs：架构围栏治理与 Epic AG Story 追加（AG.8–AG.11）

**类型**：docs
**影响模块**：`AGENTS.md`（v2.5.8 → v2.6.3）、`CLAUDE.md`（改为指针文件）、`docs/specs/epic-AG/`
**摘要**：架构审视后完成规约围栏治理：确立 AGENTS.md 为单一事实源，CLAUDE.md 变为工具兼容指针；AGENTS.md 补入多 Agent 协作运行时章节（facade/ui 组装豁免取代「不 import 外部模块」声明）、跨包导入必须使用包名说明符条款、协作运行时性能指标、数据根解析规则与实际 data 子目录；技术栈表补入 Monorepo/Electron。新增 4 个治理 Story：AG.8 包边界治理（125 处跨包相对路径 + lint zones）、AG.9 core 公共 API 收缩（exports 通配符 84→显式白名单 + jsx 副本清理）、AG.10 巨型文件拆分（7 文件）、AG.11 重复与死代码嗅探（knip 基线 + 双文档树处置）。

---

## 2026-09-29 — feat：AG.8-T1 跨包说明符边界（lint 拦截 + 启动文件 spike + F1 打包 staging）

**类型**：feat
**影响模块**：`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`packages/desktop/src/main/{setup-data-root,main,agent-worker-runtime-deps}.ts`、`packages/desktop/scripts/{prepare-core-runtime,prepare-web-standalone,verify-ontology-runtime}.js`、`packages/desktop/{package.json,electron-builder.yml}`、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/add-cross-package-specifier-imports/`
**摘要**：AG.8-T1 落地跨包说明符边界（Proposal `add-cross-package-specifier-imports`，已合并 refactor/arch-governance）。拦截机制放弃 `import/no-restricted-paths` zones（pnpm 链接下物理路径判定误报 ~589），改用 `no-restricted-syntax` 5 selector 字面量匹配（warning，零误报），checker 以 error 级镜像，selfTest 43→50；迁移 3 个启动关键文件共 25 处导入为 `@originos/core/...`（tsc 保留说明符字面量，产物解析由新增 Fallback-F1 解决：`prepare-core-runtime.js` staging dist-electron/core 并按 24 个真实消费说明符闭集生成 exact exports，electron-builder 打包为 node_modules/@originos/core，打包产物启动冒烟 0 MODULE_NOT_FOUND）；附带修复 2 个前置既有打包脚本缺陷（prepare-web-standalone hoist 误拒、verify-ontology-runtime 挂起不退出）。存量违规 128 处留待 AG.8-T2 迁移后升 error。

## 2026-09-29 — feat：AG.8-T2 desktop 存量说明符迁移与 error 强制执行（Story AG.8 完成）

**类型**：feat
**影响模块**：`packages/desktop/src/`（27 服务文件 + 测试）、`packages/web/src/`（测试）、`packages/core/src/types/index.ts`、`packages/desktop/vitest.config.ts`、`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`AGENTS.md`（v2.6.3 → v2.6.4）、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/migrate-desktop-core-specifiers/`
**摘要**：AG.8-T2（Proposal `migrate-desktop-core-specifiers`）完成剩余存量迁移：154 处跨包相对导入（119 from + 9 动态/typeof + 26 测试，含 10 处 vi.mock 字面量）全部改为 `@originos/core/...` 包名说明符；types 深路径收敛到 `@originos/core/types`（core types index 显式补 `OntologyEntity`/`OntologyRelation` 重导出）；`no-restricted-syntax` 拦截规则升 error（selfTest 51 例），`lint:boundaries` 966 文件 0 诊断、新增违规非零退出阻断；desktop vitest 补 `@originos/core` resolve.alias 与 web 对齐；F1 打包 staging 自动扩展至 70 个消费说明符（130 条 exports 全部 resolve），打包产物启动冒烟 0 MODULE_NOT_FOUND；测试基线零 delta（web 425/425）。Story AG.8（T1+T2）至此完成，AGENTS.md v2.6.4 标记该条款强制执行。遗留：T1 产物中 5 处 `/index` 形态说明符留待 AG.9 exports 治理统一收敛。
