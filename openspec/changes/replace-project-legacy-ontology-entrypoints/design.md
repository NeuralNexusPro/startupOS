# Design

## Context

见 `proposal.md`。目前 `CanonicalOntologyStore` 已提供项目隔离、原子快照和 public API；ONT.3 已提供 legacy 的 dry-run、正式迁移、备份和只读投影。项目创建、项目 Agent 及 Web/Desktop 编辑器仍存在以 `business-model.json` 为主的独立入口，且有加载时自动同步写入。

## Goals / Non-Goals

**Goals:**

- 新项目建立时只写 canonical ontology，并把项目 metadata 绑定到精确版本。
- 所有项目入口通过一个 Core 的只读解析服务获取 canonical ontology 或明确的 legacy 状态。
- 用显式迁移取代自动同步，防止页面访问成为写操作。

**Non-Goals:**

- 不迁移存量项目，不删除 legacy 文件，不重写 OSDK/solution/runtime。
- 不让 Web 或 Desktop 复制转换逻辑，也不引入第二个本体存储。

## Decisions

### 1. 建立 Project Ontology Entry Service

在 `packages/core/src/lib/features/project/` 增加公共 service/DTO：新项目初始化调用 ontology public API 写入 canonical snapshot；读取方只获得 `canonical`、`legacy_migration_required` 或 `not_found` 的判别结果。

选择此方案，因为项目 feature 负责项目生命周期，而 ontology feature 保持平台无关的 schema/store/migration 所有权。替代方案是在每个 Web/Desktop service 直接读文件；拒绝，因为会重新引入重复转换和路径绕过。

### 2. 明确新旧项目分流

项目 metadata 中保存 `ontologyRef { ontologyId, ontologyVersion }`。有该引用时严格读取对应 canonical ontology；无引用且发现 legacy 源时只返回迁移状态。正式迁移完成后，以一次受控 metadata 更新绑定 canonical ref；读取不尝试猜测 latest 或自动迁移。

选择精确引用而非“按项目读取最新”，因为方案合同和运行时已要求 ontology/version 固定。替代方案是将 legacy 数据自动投影后继续作为运行输入；拒绝，因为投影会掩盖版本漂移且违反唯一事实源。

### 3. 编辑器只消费 Core 投影

Web 的本体/数据视图改用 Core public adapter 返回的 canonical 编辑 DTO；编辑命令经 Core 服务和 canonical Action Gate。旧 `ontology-data` 自动 sync 不再在组件 mount 时调用。Desktop 同步提供同样的 IPC 状态和命令。

选择保留薄 transport adapter，而非将 canonical storage 暴露给 renderer，以保持身份、路径与版本门控在 Core/Desktop 边界。

### 4. 分批替换，先切新项目与读取入口

Task 1 先完成 Core entry service 和新项目写入；Task 2 将项目 Agent/方案读取替换；Task 3 替换 Web/Desktop 编辑器并移除自动同步调用。每步以新项目、legacy 未迁移和显式迁移后的项目三组夹具验证。

## Risks / Trade-offs

- [旧 API 仍被非项目入口调用] → 先保留兼容 API，使用调用搜索和测试确认后另行 Proposal 删除。
- [项目 metadata 与 canonical snapshot 部分失败] → 采用创建前校验、写入后受控 metadata 更新；失败返回可恢复错误，不生成 legacy 替代写入。
- [编辑器尚未具备所有 canonical 写操作] → 对未支持命令显示只读和明确 unavailable，不回退到旧同步写入。
- [存量项目体验变化] → 提供显式迁移状态和 dry-run，不在启动时改变用户数据。

## Migration Plan

1. 发布 Core entry service 与新项目 canonical 初始化。
2. 切换项目 Agent、方案和编辑器读取入口，保留旧项目的只读状态。
3. 通过现有 ONT.3 迁移执行旧项目转换及 metadata 绑定。
4. 记录调用方收敛证据后，单独移除未使用的 legacy 写入 API。

回滚时撤回入口切换和新初始化调用；不删除已创建 canonical snapshot、legacy 源文件、备份或迁移记录。
