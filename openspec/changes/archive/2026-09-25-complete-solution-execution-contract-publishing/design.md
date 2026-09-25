# Design

## Context

动机见 [proposal.md](./proposal.md)。Core 已有 `SolutionExecutionContract`、编译器和文件 store，解决方案界面仍读取 legacy manifest，缺少正式发布应用服务。实现必须服从 `AGENTS.md`：Web route 保持薄边界，业务实现位于 Core feature，存储继续使用本地 JSON。

## Goals / Non-Goals

**Goals:**

- 从项目 solution version 和 canonical ontology 构造并发布唯一执行契约。
- 让 Web UI 与 9.42/ONT.8 消费相同版本、hash 和 DesignGap。
- 保证并发发布、重复请求、撤销和进程重启后仍保持不可变语义。

**Non-Goals:**

- 不启动 Run、调度 Worker 或写 Evidence。
- 不替 legacy manifest 猜测缺失 verifier、权限或语义引用。
- 不新增数据库、后台服务或 Desktop 专属业务副本。

## Decisions

### Core 应用服务拥有装配与发布事务

在 solution feature 公共边界增加 project-scoped service，输入为精确 project/solution/version 与发布命令。服务读取 canonical ontology 和现有 solution bundle，转换为 contract body 后调用唯一编译器与 store。Web route 只负责 schema 解析和响应映射。

替代方案是在 route 或组件中组装 contract body。该方案会复制语义校验并使 Desktop 与 Web 漂移，因此不采用。

### 显式编译适配器消费现有 solution bundle

用窄 `SolutionDesignSource` port 读取 P2.5/P2.6/P2.7 的确认版本、拓扑和契约引用；缺失字段产生 DesignGap，不填默认值。这样允许后续替换 legacy bundle reader，而不改变发布服务或契约 schema。

替代方案是让 store 直接解析 manifest。Store 只应拥有不可变持久化，混入设计格式会破坏单一职责，因此不采用。

### Legacy 输入必须显式选择兼容读取

默认发布源只读取版本化 solution bundle。若只检测到 legacy 文件，Core 返回 `LEGACY_COMPATIBILITY_SELECTION_REQUIRED`，不得自动回退；调用方只有在用户明确选择迁移/兼容检查后，才能以 `legacy_compatibility` 重新检查和发布。兼容读取仍执行与版本化 bundle 完全相同的语义、ontology 和发布门控，不写回或补造 legacy 文件。

### 语义确认与 Fact 策略属于不可变契约

每个语义对象槽位必须记录 `confirmed` 或 `ambiguous` 解析状态。`confirmed` 必须引用本契约中的来源证据，`ambiguous` 一律产生阻断 `DesignGap`。所有运行时必需输入 FactType 必须显式声明状态策略（任意或精确 business state）和新鲜度策略（任意或最大年龄）；系统不得推断默认策略。上述字段参与规范化 hash，策略变化必须形成新 contract hash 和新 solution version。

### 检查与发布复用同一编译结果

`check` 只运行加载、转换和校验，不写文件；`publish` 重复执行同一确定性流程后原子写入。发布不信任浏览器上一次检查结果，避免设计在两次请求间变化。

替代方案是把完整 contract 从 renderer 回传发布。该方案允许篡改并扩大 IPC/HTTP 负载，因此不采用。

### 文件 store 继续作为唯一事实源

契约路径仍为 `data/projects/{projectId}/solutions/contracts/`。并发请求由 Core store 的 project/version 队列串行化；同内容重试返回既有契约，不同内容复用版本时结构化冲突。UI 状态仅为投影。

### Web UI 通过 service 适配器接入

在 `packages/web/src/services/` 放置 typed client，在现有 SolutionDesign 中加入发布状态面板。组件不导入 Node store 或路径模块，不维护乐观“已发布”事实；请求完成后重新读取权威状态。

### 实施边界

- Core：service、source port、转换器、存储幂等和定向测试。
- Web transport：API route/client 与 contract tests。
- Web UI：发布面板、DesignGap 定位和组件测试。
- Verification：跨 P2.8/9.42/ONT.8 fixture、性能与架构证据。

各边界通过 Core 公共 DTO 交互，禁止互相导入私有实现。

## Risks / Trade-offs

- [旧 solution bundle 字段不完整] → 返回可定位 DesignGap，保留原文件，不自动补造。
- [检查后设计变化] → 发布时重新编译并校验，不使用 renderer 缓存。
- [大型方案阻塞请求] → 异步文件 I/O，增加中等规模小于 5 秒的性能测试。
- [两入口状态漂移] → 所有入口共享 Core service 与 store，transport parity 测试覆盖。
- [撤销误操作] → 撤销只追加独立记录，不删除 contract 正文，并要求明确 reason。

## Migration Plan

1. 先交付 Core service 与只读状态接口，保持旧 solution 浏览不变。
2. 接入检查/发布 UI；旧版本在未发布时显示“未发布”，不能启动新 9.42 Run。
3. 通过 P2.8、9.42、ONT.8 联合测试后随 `0.4.x` 发布。
4. 回滚 UI/API 时保留已发布 contract；运行时仍可按精确版本读取，不自动回退 legacy manifest。
