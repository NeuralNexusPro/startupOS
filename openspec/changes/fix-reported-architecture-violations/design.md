## Context

当前基线为 dev b2d6bdb。原检查器扫描 853 个生产文件，发现 34 处违规；精确文件和行号见 Story AG.5 的 lint-baseline.md。AG.2 的旧单包目录和“modules 不得依赖 integrations”判断已不符合当前 AGENTS.md，本轮先同步文档。

## Goals / Non-Goals

**Goals:** 在原规则和生产扫描范围下清零 34 处违规；保证 Agent 运行、认知持久化、IPC、工具注册和聊天显示兼容。

**Non-Goals:** 不扩展规则覆盖，不清理全部 lint warning，不整体移动 pi-agent，不引入新容器或数据库。

## Decisions

### 1. 按实际职责恢复单向依赖

目标依赖为：Web/Desktop/worker 边界 → Core 业务组装 → integrations/storage/shared/types。业务组装归属 `packages/core/src/lib/features/agent/`，从该 feature 的公共入口导出。跨 feature 调用采用公共 index；只在需要业务能力的运行时入口传入函数或已有 deps，不创建通用服务定位器。

底层类保留模型调用、事件流、会话生命周期等基础设施职责。MemoryCore、MemoryProvider、ObservationPolicyResolver、认知迁移与 archival 写入策略由上层组装。`provider-factory.ts` 的业务组装迁出 integrations；KnowledgeProvider 等仅需要的 DTO 依赖真实的底层契约。PatternProvider 的迁移/沉淀策略放在业务层；extractor 的 insert 和 provider 的 delete 也必须纳入实际调用契约或随业务实现上移，不能只抽取只读接口；底层通过最小调用契约获取其能力；不得把 MemoryCore 整体放到 shared。

`agent-manager.ts`、`persistent-agent-manager.ts`、`persistent-agent.ts` 对记忆和 session service 的直接引用改由上层供给；逐一追踪普通 Agent、RoleAgent、Project Agent、协作运行时和 worker 的创建路径，防止未注入时静默关闭认知。必需依赖缺失须明确失败；现有本来不持久化的临时会话保留该语义。

### 2. 公共契约与纯函数下沉

- Electron IPC 的技能、用户注册 DTO、EntryType 和权限提示常量提取到 `core/src/types` 或现有 shared 对应域；业务模块可向下重导出，基础设施不能向上重导出。
- MemoryOwnershipContext、ObservationContext、认知候选与 archival 最小读写契约提取到现有 shared/cognitive，对只用于类型的依赖不引入类实例依赖。
- Markdown 记忆块解析函数移到下层单一实现，MemoryCore、Role/Project context 共同使用；保留标题、容量和空输入行为。
- 用户配置文件读取移到 storage；业务默认值与配置更新策略仍在 feature。保持数据根、错误处理与配置优先级。

不复制 DTO 或解析实现，不用动态字符串 import 隐藏依赖。替代方案“把所有基础设施改列为业务层”会破坏既有规约；“仅改 import type / eslint-disable”没有解决依赖，均不采用。

### 3. 业务工具由业务层注册

文档、本体、本体数据、定时任务工具实现与业务注册移到 feature 的业务工具组装位置。底层保留 ToolRegistry、通用工具和执行协议。上层依赖现有 registry 注册完整工具集合，避免同时拥有两份工具清单。同步所有 initializeBuiltInTools 调用链，包括 Web store、Desktop worker 的 runtimeImport 和打包验证脚本。保持工具名、参数 schema、scope 过滤、权限检查、错误返回和重复初始化幂等性。

PersistentAgentManager 当前全局单例的构造函数会立即注册工具，必须将完整注册延后到业务依赖组装后的启动阶段；不能先触发构造再补注入。`integrations/pi-agent/store.ts` 的三处初始化入口由上层传入注册能力，Store 不得反向导入业务 feature；浏览器入口保持服务端能力懒加载/隔离，禁止把 Node 文件系统与业务工具实现带入浏览器静态依赖链。测试覆盖冷启动、重复初始化和浏览器构建。

### 4. 通用聊天组件归位

ToolExecutionFrame 只有工具执行状态展示职责，移到 `web/src/components/ui/chat/`，更新 ChatMessageList 与业务调用方；保留 props 与视觉交互。无需新增 UI 注入容器。

### 5. 状态与运行契约

用户/项目/Agent 文件仍是持久化事实源。依赖对象不缓存不同 owner 的实例，不改变锁、flush、turn_end/session_end 时序或失败处理。Frozen Snapshot 仍在启动时加载；会话恢复不得重复注册钩子或工具。禁止新增每轮磁盘遍历/LLM 调用，保留路径验证与执行授权。公共 IPC payload 与工具协议保持原样，内部 import 更新必须覆盖 package exports 与打包运行入口。

### 6. 实施边界

批准后启动两个无重叠 Task worktree：A 仅处理 Web ToolExecutionFrame 迁移、直接 UI 调用方和组件测试；B 处理 Core 全部违规、契约迁移、业务组装及 Desktop/worker/Web 非组件启动适配和测试。A、B 可并行。B 不修改 `web/src/components/**`；若引用追踪发现必须改此目录，先记录需求，待 A 合并后在 B 的后续串行提交处理，不允许重叠写入。父代理负责文档、集成、完整回归与证据整理，不直接实施应用源码。

## Risks / Trade-offs

- 业务入口漏接或循环 import → 各类 Agent 冷启动/恢复与 worker 独立进程测试；检查迁移后的传递依赖，不只看违规行消失。
- owner 共享导致认知串写 → 两个不同 owner 并发测试、临时会话测试、错配 owner 拒绝测试。
- 打包动态路径丢失 → 核对 runtimeImport、package exports 和资源复制规则，运行打包后 worker 工具加载脚本。
- 解析或配置行为漂移 → 使用既有输入样本和临时目录回归，不用真实用户数据做测试。
- 当前 lint 检查并不覆盖全仓循环依赖 → 明确结果限定于已有围栏，另人工检查新组装链的循环，避免夸大合规结论。

## Migration Plan

先固定基线与验收文档，strict validation、审查和显式批准后实施。A、B 独立提交，合并到 Proposal 后运行全部必需检查；完成 Story 验证 goal 后合并 dev、按工作流归档和清理。无用户数据迁移；回滚整个 Proposal 提交恢复原实现。

## Open Questions

无需要用户选择的产品决策。实施时确定最终内部文件名和最小依赖参数，并将结果及公开 import 变化记录到 implementation.md；若需改变持久化、IPC 或运行时行为，停止该扩展并修订提案。

## 用户追加的通知入口修复（2026-09-11）

用户在本轮实施中报告：从通知进入技能或角色出现 CHANNEL_RUNTIME_FAILED。已确认通知携带中文 entryId，渠道层沿用仅ASCII的传输标识校验，导致 Agent 启动前被拒绝。本次作为会话入口兼容性修复纳入 AG2-T1；不变更数据格式或IPC字段。

AG2-T1-TC11：中文技能、角色与继承角色所有权的技能，经真实渠道 ingress 和桌面通知会话流能够进入运行时并完成；空白、超长、控制字符、路径分隔符与穿越标识仍被拒绝；消息/connector/actor/replyHandle 的原传输标识校验保持不变。测试先复现原错误，再验证修复。

独立通知Task仅修改channel-runtime的业务入口标识校验及对应Core/Desktop测试，Core组装Task不写这些文件。父代理负责集成，源码仍由subagent隔离实施。授权来源：用户本轮追加bug报告，延续已批准修复工作；不新增产品能力。
