# Design

## Context

动机见 [proposal.md](./proposal.md)。ONT.1–ONT.7 的实现位于 `packages/core/src/lib/features/ontology/`，现有 Web `app/api/ontology*` 与 Desktop `ontology-service.ts` 仍主要面向旧 entity/graph 接口，且各自存在业务校验。P2.8、9.42、9.43 的 Story 已定义契约发布、运行绑定和看板投影，但仍处于 Planning；因此 ONT8-T1 必须先验证前置公共端口存在，再接入，而不能在 adapter 内补造这些能力。

本设计遵循 `AGENTS.md`：Next.js route 与 Electron main 只做 transport 边界；共享编排位于 core Layer 2；存储、Pi/Electron integration 与共享类型位于 Layer 1；所有 feature 间引用只经过公共 `index.ts`。

## Goals / Non-Goals

**Goals:**

- 让 Web 和 Desktop 以相同版本化 DTO 调用同一项目语义执行应用服务。
- 保持 ontology、solution contract、Task/Evidence、Run/WorkItem 各自唯一事实源。
- 把 E01–E16 收敛为可重复执行的跨包夹具、故障注入与平台验收矩阵。
- 对缺失前置能力、旧版本、并发冲突和未知副作用安全关闭。

**Non-Goals:**

- 不扩展 canonical ontology schema，不实现 P2.8/9.42/9.43 的业务逻辑。
- 不提供通用 RPC 框架；只增加 ONT8-T1 所需的请求、响应和 transport 映射。
- 不迁移或重写旧项目；兼容读取继续由 ONT.3 和既有 legacy API 负责。
- 不把自动化无法证明的平台结果标记为通过。

## Decisions

### 1. 共享编排落在 core project feature

在 `packages/core/src/lib/features/project/` 增加最小的 project semantic execution application service 与 `types.ts`，通过公开端口组合 ontology、solution contract、task runtime 和 collaboration runtime。该服务只执行身份/版本/权限门控、调用次序和响应归一化，不持久化第二份状态。

依赖方向：

```text
Web route / Desktop IPC
  -> project semantic execution public API
      -> ontology public API
      -> solution contract public API（P2.8）
      -> task runtime public adapter
      -> collaboration runtime public facade（9.42）
      -> project task projection public API（9.43）
          -> 各自既有 storage / integration
```

同层依赖必须从 capability 的 `index.ts` 导入；application service 通过构造参数接收端口，避免 project 与 collaboration/solution 的具体实现循环依赖。

**替代方案：** 把编排放入 ontology feature。拒绝，因为 ONT 不拥有 Task/Run，容易把 bounded context 变成上帝服务。把逻辑分别写入 Web 和 Desktop 也拒绝，因为会复制门控并造成 transport 漂移。

### 2. 一个版本化 transport contract，两种薄映射

core 公共类型定义 discriminated union 请求和结果，至少覆盖：读取语义上下文、查询 facts/projection、提交 Action、启动/检查/控制绑定任务。成功结果携带关联 ID、revision/cursor 与回执引用；失败结果携带稳定 `code`、`category`、`issues`、`retryable` 和安全 remediation，不暴露绝对路径或正文。

Next.js route 仅解析 JSON、注入授权主体/data root/公共端口并映射 HTTP status。Electron main handler 仅校验 sender 与 channel 参数、注入相同依赖并映射 `IpcResponse`；preload 只暴露 allowlist 中的精确方法。客户端不自行重试 mutation。

**替代方案：** 复用现有旧 `OntologyEntity` API 作为 canonical contract。拒绝，因为它缺少 ontology version、operation receipt、attempt/epoch 和精确权限字段。引入通用 RPC schema 库也拒绝；现有 TypeScript 类型和边界校验足够。

### 3. 写操作采用“门控—意图—接纳—Evidence”顺序

应用服务先读取并固定 ontology、contract、Task/Run scope 与 expected revision，再调用 ONT OSDK。OSDK accepted receipt 是事实接纳证据；随后 9.42 登记 WorkItem 接纳事件，最后通过受控 pi-tasks public adapter 附加 Evidence。每一步复用同一 request/operation ID 派生的稳定关联键，并在恢复时从各权威 ledger 对账。

```text
validate exact scope
  -> persistent intent
  -> ONT Action / accepted receipt
  -> WorkItem acceptance
  -> verified Evidence
  -> Task completion gate
```

不可查询且无幂等能力的外部副作用返回 `manual_reconciliation_required`，不自动重放。

**替代方案：** 跨文件事务或补偿式全局回滚。拒绝，因为当前只允许文件存储且多个事实源不能原子提交；持久意图与幂等对账更符合已有协议。

### 4. 查询聚合不拥有状态

项目任务详情只聚合引用与摘要：ontology/fact ref、contract ref/hash、Task/Evidence revision、Run/WorkItem/attempt、artifact/source ref。列表与看板继续由 9.43 project projection 提供；缺失或损坏的可重建投影从事实源恢复。Web/Desktop 响应不缓存权威状态。

**替代方案：** 在 ONT8 建立统一 aggregate JSON。拒绝，因为这会成为第二事实源并引入跨模块双写。

### 5. E01–E16 使用一套场景夹具分层执行

测试夹具创建临时 project data root，调用真实 core store/OSDK/public adapters，并由同一 scenario table 驱动 core integration、Web route contract、Desktop IPC contract。故障点以显式 hook 注入 intent、Action、acceptance、Evidence 边界，不依赖正常 shutdown hook。Web/Desktop parity 比较规范化结果，忽略 transport 专属时间戳。

平台验证分两层：CI/本机可运行 contract tests；Windows x64、macOS x64/arm64 对实际打包产物执行启动、module resolution、preload allowlist、强退/恢复 smoke，并分别保存 evidence。未执行的平台保持未验证状态。

**替代方案：** 仅用 mocked route/IPC 测试。拒绝，因为不能证明文件提交、进程恢复或打包解析。为每个平台复制测试也拒绝；共同 fixture 可减少漂移。

### 6. 前置门与上线开关

实施前必须通过 readiness audit：P2.8 可发布并精确读取不可变 contract；9.42 可绑定并恢复 Run/WorkItem；9.43 可查询/控制同一 Task projection；受控 pi-tasks adapter 可公开提交 Evidence。任一缺失时 ONT8 正式入口返回 unavailable，集成测试保留为 pending evidence，不通过私有 import 绕开。

上线顺序为 core contract/service → Web/Desktop adapters → E01–E16 → platform package smoke。旧 API 不删除；新入口仅在完整依赖与 compatibility matrix 匹配时启用。

## Data Ownership and Recovery

| 数据 | 唯一事实源 | ONT8 行为 |
|---|---|---|
| ontology / facts / Action receipt | ONT store / OSDK | 精确版本读写、保存引用 |
| solution execution contract | P2.8 contract store | 精确读取、hash 校验，不取 latest |
| Task / Criterion / Evidence / Blocker | pi-tasks current branch | 只走 public adapter |
| Run / WorkItem / attempt / lease | 9.42 runtime ledger | 绑定、检查、恢复 |
| project board / context projection | 9.43 / ONT projection | 只读聚合，可重建 |

恢复以 operationId/requestId、revision、cursor、attempt 和 lease epoch 交叉核对。snapshot 只保存 refs；损坏 snapshot 阻塞并提示恢复来源，不猜测状态。

## Security and Performance

- transport trust boundary 在读取正文前验证 actor、project 与路径；core 再验证 ontology/contract/Action 权限，形成纵深防护。
- 日志只记录安全 ID、版本、code、revision 和 diagnostic reference；禁止正文、凭据、prompt、附件字节与完整工具输出。
- 查询使用 cursor 分页，默认 50；正文和 artifact 按需读取。API/IPC 只传引用和有界摘要。
- 交互响应遵守现有 500ms 目标；外部模型推理不进入 adapter。恢复与跨包测试按场景记录耗时，不用放宽门禁换性能。

## Subagent Boundaries

获批后可在独立 Task worktree 中按以下互斥写入范围实施：

1. **Core contract/service：** `packages/core/src/lib/features/project/` 及其测试。
2. **Web adapter：** `packages/web/src/app/api/` 下 ONT8 routes 及 route tests。
3. **Desktop adapter：** `packages/desktop/src/main/`、preload/IPC contract 与其测试。
4. **Integration/packaging verification：** 跨包 fixture、E2E 脚本与平台 evidence 文档；不修改前三项实现文件。

Core contract 冻结后 Web 与 Desktop 可并行；E2E 在三者合并后串行执行。每个 subagent 只能提交自己的范围。

## Risks / Trade-offs

- [P2.8/9.42/9.43 尚未实施] → readiness audit 是硬门；ONT8 不补造临时接口，Proposal 可批准但实施不能宣称完成。
- [现有 Web/Desktop ontology API 含重复旧逻辑] → 新 canonical 入口并行接入，旧 API 本轮不删除；后续有使用证据再收敛。
- [多文件事实源无法原子提交] → 使用持久意图、幂等回执与对账恢复；未知副作用进入人工核对。
- [平台矩阵成本高] → 复用同一场景夹具，仅保留必要的真实 package smoke；未执行平台明确标记，不推断通过。
- [聚合读取延迟] → 分页和按需详情；不以复制状态换取速度。

## Migration Plan

1. 完成前置能力 readiness audit，并固定 compatibility matrix。
2. 合入 core application service 与 contract tests，默认不暴露正式入口。
3. 接入 Web route 与 Desktop IPC/preload，运行 parity tests。
4. 在临时新项目执行 E01–E16；再用只读旧项目 fixture 验证兼容。
5. 完成 development、Windows x64、macOS x64/arm64 package smoke 后启用入口。

回滚时移除或禁用新 routes/channels 与 application service 装配，保留既有 API。由于不新增事实源、不自动迁移旧项目，回滚不删除或改写用户数据；任何已 accepted 的事实和 Evidence 按原 ledger 保留。

