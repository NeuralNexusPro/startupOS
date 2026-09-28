# OriginOS CE 产品需求文档

**版本**：3.0（当前实现对齐版）  
**项目**：OriginOS CE  
**最后更新**：2026-07-15  
**适用范围**：桌面端与 Web 端当前代码实现

---

## 1. 产品定位

OriginOS CE 是一个面向个人与小团队的 AI Native 工作系统。它不是传统意义上的操作系统，而是运行在 Web / Electron 桌面壳之上的“Agent 工作台”：用户通过项目、角色 Agent、技能、文件、通知和定时任务组织自己的工作流，让 AI 能够持续执行、沉淀经验并在需要时主动唤起。

当前产品的核心价值是：

- 用对话启动和管理项目、角色、技能与工作空间。
- 用 Agent 工具系统把自然语言意图落到本地文件、文档解析、技能调用、系统通知和定时任务。
- 用本地数据目录承载项目、Agent、Skill、记忆、实践日志和经验模式。
- 用桌面主进程提供系统级能力，包括原生通知、后台调度、跨窗体事件和自动更新。

## 2. 目标用户

| 用户类型 | 典型目标 | 核心使用场景 |
| --- | --- | --- |
| 个人知识工作者 | 把分散任务交给可持续协作的 Agent | 创建角色、安装技能、上传附件、生成文档、沉淀经验 |
| 产品/业务负责人 | 用项目 Agent 梳理业务问题并沉淀方案 | 项目初始化、访谈、方案设计、工作区文档管理 |
| 技能使用者 | 快速调用专项能力而不关心底层工具链 | 首页技能入口、技能市场、技能窗口会话与附件上传 |
| 自动化使用者 | 让系统在指定时间主动提醒或启动能力 | 定时通知、定时启动角色/技能、系统工具调用 |
| 桌面端用户 | 需要本地文件、系统通知和自动更新 | Electron 桌面包、系统通知权限、日志排查、更新测试 |

## 3. 产品目标

1. **降低 AI 工作入口成本**：用户不需要理解工具链，只需从首页、Dock、通知或定时任务启动能力。
2. **建立可持续工作的 Agent 形态**：Agent 不只是一次性聊天窗口，而拥有工作目录、工具箱、记忆、知识和经验模式。
3. **提供系统级唤起能力**：用户可以通过时间、通知点击、应用内通知栏和主进程调度唤起项目、角色、Agent 或技能。
4. **保证本地优先与可迁移**：运行时数据使用文件系统组织，避免数据库依赖，便于调试、迁移和打包分发。
5. **为认知系统演化打基础**：通过实践日志、Memory.md、Knowledge.md、Patterns.md 和周期性总结形成可持续优化的行为资产。

## 4. 当前产品形态

OriginOS CE 当前包含两种运行形态：

- **Web 应用**：基于 Next.js App Router，承载首页、项目、技能窗口、通知栏、定时任务面板、工作区等 UI。
- **桌面应用**：基于 Electron，打包 Web standalone renderer，并提供主进程能力：本地 renderer server、原生窗体、系统通知、后台定时调度、自动更新、日志落盘和平台包分发。

## 5. 信息架构

```text
OriginOS CE
├── 首页工作台
│   ├── 创建 Agent
│   ├── 创建角色
│   ├── 技能市场
│   ├── 工作区
│   ├── 头脑风暴
│   └── 工作流构建
├── 项目系统
│   ├── 项目列表
│   ├── 项目初始化
│   ├── 项目 Agent
│   ├── 项目文件
│   └── 业务模型/方案产物
├── Agent 系统
│   ├── 通用 Agent
│   ├── RoleAgent
│   ├── Project Agent
│   ├── 多 Agent 协作运行时
│   └── 记忆/知识/模式沉淀
├── Skill 系统
│   ├── 内置技能
│   ├── 用户技能
│   ├── 项目技能
│   ├── 技能市场
│   └── 技能窗口
├── 系统能力
│   ├── 文件工具
│   ├── 文档解析工具
│   ├── 定时任务
│   ├── 系统通知
│   └── 自动更新
└── 桌面运行时
    ├── Electron 主进程
    ├── 本地 renderer server
    ├── 原生窗体管理
    ├── userData 数据目录
    └── desktop.log / llm.log
```

## 6. 核心能力需求

### 6.1 首页应用入口

**状态**：已实现  
**实现依据**：`packages/web/src/config/homeApps.ts`

首页以配置驱动方式渲染内置应用卡片。卡片分为：

- `action`：直接触发系统动作，例如创建 Agent、打开工作区。
- `skill`：打开指定技能窗口，例如创建角色、技能市场、头脑风暴、工作流构建。

**需求要求**：

- 首页入口必须由配置集中管理。
- Skill 入口必须能打开 `SkillDialog` 并创建对应技能会话。
- Action 入口必须进入对应系统窗口或流程。

### 6.2 Skill 系统

**状态**：已实现  
**关键能力**：

- 支持内置技能、项目技能、用户技能多源加载。
- 支持技能内容读取、技能窗口会话、流式对话、附件上传。
- 支持技能市场搜索与安装。
- 技能产物默认写入可写数据目录，避免写入只读技能源目录。

**需求要求**：

- 技能源目录只作为定义读取，不作为产物输出目录。
- 技能窗口附件上传必须支持多次重复选择。
- 技能调用必须继承合理的工作目录，项目内技能优先使用项目路径。

### 6.3 Agent 与 RoleAgent

**状态**：已实现  
**关键能力**：

- 通用 Agent 支持会话创建、消息流式响应、工具调用、健康状态和销毁。
- RoleAgent 使用 `Agent.md`、`Role.md`、`Tool.md`、`Taste.md`、`Memory.md`、`Knowledge.md`、`Patterns.md` 构建角色上下文。
- Project Agent 使用项目上下文、项目文件和项目技能工作。
- Agent 可以通过工具读写文件、解析文档、调用技能、创建定时任务和运行系统工具。

**需求要求**：

- Agent 工具权限必须由上下文和 Tool.md 控制。
- Agent 工作目录必须屏蔽操作系统路径差异，Windows/macOS 展示路径统一为可读格式。
- Agent 关闭时应触发认知会话收尾，刷新 Memory/Patterns 等快照。

### 6.4 项目系统

**状态**：已实现/持续完善  
**关键能力**：

- 项目列表与项目文件管理。
- 项目初始化生成 Agent 相关工作文件。
- 项目 Agent 可在项目目录中执行任务。
- 业务访谈、业务模型、方案设计等产物以文件形式沉淀。

**需求要求**：

- 项目运行时数据必须存放于 `data/projects/{project-id}`。
- 项目 Agent 必须继承项目工作目录。
- 项目更新事件必须跨窗体同步刷新。

### 6.5 定时任务

**状态**：已实现  
**实现依据**：`packages/core/src/modules/scheduler/*`、`packages/web/src/components/os/schedules/ScheduleDialog.tsx`、`packages/desktop/src/main/services/desktop-scheduler-service.ts`

定时任务是 OriginOS 的系统能力，支持用户配置未来或周期性动作，并由桌面主进程后台调度。

**触发类型**：

- 一次性时间：`once`
- 固定间隔：`interval`
- 标准 5 字段 Cron：`cron`（当前支持分钟/小时数字或 `*`）

**动作类型**：

- 启动角色/Agent，并可携带初始指令。
- 启动技能，并可携带初始指令。
- 发送系统通知，通知点击后可唤起项目、Agent、RoleAgent 或 Skill。
- 调用系统工具。

**界面要求**：

- 入口位于右上角系统图标区的定时任务按钮。
- 打开后先展示任务列表。
- 支持新建、编辑、删除、立即运行。
- 支持一次、每隔、Cron 三种周期配置。
- 对话框层级必须高于其他按钮和窗体浮层。

**后台要求**：

- 桌面主进程启动后立即扫描一次到期任务。
- 主进程每 30 秒扫描并执行到期任务。
- 避免并发重复扫描。
- 每次运行写入 run log，并更新任务状态和下次运行时间。

### 6.6 通知系统

**状态**：已实现  
**实现依据**：`NotificationPanel`、`NotificationBell`、`native-notification-service.ts`

通知系统同时包含应用内通知和操作系统原生通知。

**应用内通知**：

- 右上角小铃铛展示未读数量。
- 通知面板支持列表、全部已读、关闭通知。
- 点击通知可触发关联动作。

**系统级通知**：

- 桌面端通过 Electron `Notification` 触发操作系统通知。
- macOS 下聚焦时会触发 Dock bounce。
- 通知失败时返回 `PERMISSION_DENIED`、`NOT_SUPPORTED`、`SHOW_EVENT_TIMEOUT` 等原因。
- 原生通知点击会发送 IPC 到 renderer，并唤起项目、Agent、RoleAgent 或 Skill。

**需求要求**：

- 应用内通知点击和系统级通知点击必须复用同一套 activation target。
- activation target 支持 `project`、`agent`、`role-agent`、`skill`。
- activation target 可携带 `initialMessage`，打开窗体后自动作为初始指令发送。

### 6.7 工作区与文件能力

**状态**：已实现  
**关键能力**：

- 工作区可管理项目文件并编辑 Markdown。
- Agent 工具支持文件读写、目录遍历、文档解析。
- Office/CSV/文本读取能力由 core document 模块提供。
- 上传附件统一通过 base64 payload，兼容 Electron IPC 序列化。

**需求要求**：

- 文件工具必须限制在授权工作目录内。
- 打包态默认数据根目录必须使用 Electron `userData/data`。
- 不允许运行时写入 DMG、asar 或应用资源只读目录。

### 6.8 认知系统与经验模式

**状态**：部分实现，持续演进  
**关键能力**：

- 每轮或周期性记录实践日志。
- Agent/Project 维度维护 `Memory.md`、`Knowledge.md`、`Patterns.md`。
- Pattern 总结由 Agent/LLM 基于实践样本生成，不用正则或字符串规则拼接正文。
- Agent 启动时加载 frozen snapshot，保持运行时上下文稳定。

**需求要求**：

- 实践日志作为事实记录，不直接污染 prompt。
- Patterns.md 必须是摘要化、可读的最佳实践/反模式/反思记录。
- 知识和经验沉淀应在 session end 或周期任务中执行，避免每轮阻塞。

### 6.9 多 Agent 协作运行时

**状态**：已实现基础运行时  
**关键能力**：

- 支持 supervisor、worker、blackboard、event timeline、topology 等运行时概念。
- 支持子进程 worker 启动与运行时依赖打包。
- 支持 HITL、事件记录、成本与指标跟踪等协作基础设施。

**需求要求**：

- 多 Agent 子进程必须使用父进程下发的运行时 LLM 配置。
- 打包后 worker 运行依赖必须来自编译产物，而不是源码目录。
- app.asar 需要自动校验相对 require 依赖，避免运行时缺模块。

### 6.10 桌面打包、签名与自动更新

**状态**：已实现，持续修复  
**关键能力**：

- macOS 支持 Developer ID 签名、hardened runtime、entitlements、notarization 配置。
- Windows 支持 NSIS 安装包和 zip 包。
- Windows zip 使用短路径 standalone，避免 `.pnpm` 长路径解压失败。
- 自动更新使用 electron-updater generic provider，更新元数据发布到 CDN。
- 桌面日志落盘到 `desktop.log` 和 `llm.log`。

**需求要求**：

- mac 自动更新包不得使用 adhoc 签名。
- Windows 安装器不得依赖易损坏的内嵌 zip 解包模式。
- 发布前必须校验 app.asar 运行时依赖和 Windows 资源完整性。

## 7. 数据与存储

OriginOS CE 当前坚持本地文件系统存储，不引入数据库。

```text
data/
├── projects/
├── agents/
├── skills/
├── sessions/
├── chats/
├── interviews/
├── ontology/
├── schedules/
└── tmp/
```

桌面打包态默认数据目录：

- macOS：`~/Library/Application Support/@originos/desktop/data`
- Windows：`%APPDATA%/@originos/desktop/data`

## 8. 非功能需求

| 类别 | 要求 |
| --- | --- |
| 本地优先 | 核心数据写入本地文件系统，支持用户自行排查和迁移 |
| 安全边界 | 文件工具必须限制在授权工作目录内 |
| 可打包 | Web standalone、app.asar、extraResources 必须可离线运行 |
| 可观测 | 桌面端必须写入 desktop.log 和 llm.log |
| 跨平台 | macOS / Windows 路径、通知、打包行为必须分别验证 |
| 可恢复 | Agent 长会话需要 token 截断、recent trace 压缩和 loop guard |
| 可验证 | 发布前需要运行 app.asar require 校验、Windows package 校验和关键构建验证 |

## 9. 当前限制

- Cron 当前只实现标准 5 字段表达式中的分钟/小时数字或 `*`，不支持复杂步进、范围和列表。
- 系统通知依赖操作系统权限；macOS 需要用户在系统设置中允许通知。
- Windows NSIS installer 在 macOS 本机 Wine64 中无法完整模拟执行，因为 NSIS stub 是 32-bit。
- Ontology 图谱、本体演化和 Taste/SOUL 理论部分仍在向工程实现逐步收敛。
- 多 Agent 协作运行时具备基础设施，但仍需更多产品化入口和失败恢复体验。

## 10. 路线图

### 近期

- 完善 Windows/macOS 发布链路的自动化验证。
- 定时任务增加更完整的 Cron 表达式支持和暂停/恢复 UI。
- 通知中心增加更清晰的动作预览与失败重试。
- 整理 PRD、白皮书、Story 与实现状态的一致性。

### 中期

- 将 Pattern/Knowledge 总结流程产品化，提供可视化查看和人工编辑入口。
- 完善多 Agent 协作入口，降低 supervisor / worker 拓扑配置成本。
- 增强技能市场的安装、升级、版本管理和权限说明。
- 补齐跨平台自动更新测试矩阵。

### 长期

- 将 Ontology、Taste、Memory、Pattern 统一为可解释的个人认知资产层。
- 形成 Agent/Skill/Project 之间的可组合工作流编排能力。
- 提供团队级共享与同步机制，但不破坏本地优先原则。
