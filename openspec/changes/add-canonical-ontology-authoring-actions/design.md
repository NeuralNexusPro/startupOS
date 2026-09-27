# Design

## Context

见 `proposal.md`。现有 `CanonicalOntologyStore` 已提供 DataFile 原子替换和按项目文件队列串行化，但没有定义编辑 revision 或 authoring 回执；旧 Web/Desktop 编辑链路仍面向 `ontology-data-store`，Desktop 写命令当前统一返回 `CANONICAL_EDIT_UNAVAILABLE`。实施必须遵守 `web/desktop -> core feature -> storage/shared/types` 的单向依赖。

## Goals / Non-Goals

**Goals:**

- 在 ontology feature 内形成唯一的定义编辑事务和稳定公共 DTO。
- 以 compare-and-swap、完整快照校验和 operationId 幂等保护并发编辑。
- 让 Web/Desktop 只承担传输适配，legacy 文件保持只读。

**Non-Goals:**

- 不把 schema authoring 建模成运行时业务 Action 或 Fact。
- 不处理实例数据、自动迁移、协同实时编辑或 CRDT。
- 不改变现有 canonical ontology `version` 的发布语义；编辑并发使用独立整数 revision。

## Decisions

### 1. 独立 authoring command，不复用运行时 OSDK Action

authoring service 接收判别联合命令，对完整 canonical ontology 的集合执行纯变换，再调用现有 validator。运行时 OSDK Action 只接纳事实并要求本体中已有 Action；用它修改 Action 自身会形成自引用且混淆事实与 schema 所有权。

替代方案是为每种编辑预置系统 Action。该方案要求污染每个业务本体并难以安全编辑系统 Action，因此不采用。

### 2. revision 存于 ontology metadata，回执存于独立 JSONL

`metadata.authoringRevision` 是快照的权威 compare-and-swap 值；旧快照缺失时解释为 0。`authoring.jsonl` 保存命令摘要和终态回执，便于跨进程幂等恢复。ontology `version` 继续表示语义契约版本，不因每次 UI 编辑自动改写。

替代方案是使用 DataFile `updatedAt` 作为 revision。时间字符串不适合作为稳定递增并发令牌，且会把存储实现泄漏到公共 API，因此不采用。

### 3. Store 提供单事务 compare-and-swap 回调

Store 在同一项目文件队列内读取当前快照、比较 revision、运行调用方提供的纯变换、原子 rename，并追加回执。这样避免 service 先读后写之间的竞态。失败命令不追加 intent，accepted 回执若在快照之后追加失败，调用方可通过快照中的 `metadata.lastAuthoringOperationId` 恢复补写回执。

### 4. 删除采用默认拒绝的完整校验

删除命令只移除目标项，不级联删除引用。若产生悬空引用，canonical validator 返回具体路径，由用户先显式删除或调整依赖。这保持变更可解释并避免隐藏数据损失。

### 5. UI bridge 使用统一 execute command

新增单个 `executeCanonicalOntologyAuthoring` bridge 与 Desktop IPC channel；Web route 解析同一 DTO。现有 UI 的领域、概念、schema 和关系操作转换为 canonical commands。Core integration service 不依赖 Web 或 Electron。

## Risks / Trade-offs

- [accepted 快照后回执追加失败] → 快照记录最后 operationId 与 command hash；重试时补齐回执并返回相同 revision。
- [既有 UI 使用 legacy 数据结构] → adapter 做显式 DTO 映射，先覆盖结构编辑；实例编辑继续明确不可用。
- [删除无法自动级联] → 返回 validator issues 和引用路径，避免不可逆隐式删除。
- [metadata 被业务使用] → authoring 字段使用 `originos.authoringRevision` 与 `originos.lastAuthoringOperationId` 保留命名空间。

## Migration Plan

1. Core 先兼容读取缺失 revision 的已有快照并完成 service 测试。
2. 接入 Web/Desktop adapters，旧项目仍由显式迁移入口分流。
3. 启用编辑 UI；不触碰 legacy 文件。
4. 回滚时停用 adapters，保留已更新 canonical 快照与 append-only 回执；Core 旧读取仍可忽略 metadata 字段。

## 实施边界

- Core 任务只修改 `packages/core/src/lib/features/ontology/` 及其测试。
- Adapter 任务只修改公共 electron bridge、Desktop service、Web route/组件及各自测试。
- 集成任务只更新 OpenSpec/Story 证据并运行验证；不得修改独立 packaging 脚本现场。

