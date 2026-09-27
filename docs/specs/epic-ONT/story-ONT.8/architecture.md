# ONT.8 架构

**Story:** Cross-package Adapters 与端到端验证  
**版本:** 0.1.0  
**最后更新:** 2026-09-19

## 设计目标

以一个 core 项目语义执行应用服务承接 Web 与 Desktop，组合既有 ONT、Solution、Task 与 Collaboration 公共端口；transport 不包含业务逻辑，查询投影不成为事实源，恢复以持久回执对账。

## 模块落点

```text
packages/web/src/app/api/...
  -> 参数/授权环境/HTTP 映射

packages/desktop/src/main/... + preload/IPC
  -> sender/channel 校验/IPC 映射

packages/core/src/lib/features/project/
  -> project semantic execution application service
  -> 版本化 request/result/error DTO
  -> 只通过各 capability public index/注入端口编排

packages/core/src/lib/features/ontology/
  -> ONT.1–ONT.7 public API（不反向依赖 project/Web/Desktop/runtime）
```

application service 放在 project feature，而不是 ontology feature：ONT 不拥有 Task/Run；project 层只协调公共端口，不持久化新 aggregate。若实施时已有 9.43 公共 project task service，则直接扩展该入口，不创建同义 service。

## 依赖方向

```text
Desktop main / Web app
  -> core project public API
      -> ontology public API
      -> P2.8 solution public API
      -> task-runtime public adapter
      -> collaboration-runtime public facade
      -> storage/integrations/shared/types
```

- app routes 不定义 Validator、migration、Action gate 或恢复算法。
- Desktop 不导入 Web；Core 不导入 Web/Desktop。
- feature 间只经 `index.ts` 公共 API；不导入 private reducer/store/session 文件。
- integration 层不反向依赖 feature/module。
- 不引入数据库、额外后端框架、`any`、CSS/UI 依赖或生成产物修改。

## 公共契约

版本化请求使用 discriminated union；适用字段必须显式存在：

```typescript
type SemanticExecutionRequest =
  | { kind: 'inspect'; scope: ExactExecutionScope }
  | { kind: 'query_facts'; scope: ExactExecutionScope; cursor?: string; limit?: number }
  | { kind: 'submit_action'; scope: MutableExecutionScope; operationId: string; action: unknown }
  | { kind: 'control_task'; scope: MutableExecutionScope; requestId: string; command: unknown };

interface ExactExecutionScope {
  projectId: string;
  ontologyId: string;
  ontologyVersion: string;
  contractId: string;
  contractHash: string;
  taskId?: string;
  sessionId?: string;
  branchId?: string;
  runId?: string;
  workItemId?: string;
  attemptId?: string;
  leaseEpoch?: number;
}

interface MutableExecutionScope extends ExactExecutionScope {
  expectedRevision: number;
}
```

实际实现必须复用 ONT.7、P2.8、9.42 与 task adapter 的已发布 DTO，而不是保留上述说明性重复类型。结果包含稳定 `code/category/issues/retryable` 或数据、revision/cursor/receipt refs；transport 专属 status 不进入业务 contract。

## 数据所有权

| 数据 | 所有者 | ONT8 权限 |
|---|---|---|
| ontology / facts / operations | ONT store / OSDK | 经公共 API 精确查询和提交 |
| execution contract | P2.8 | 精确版本读取与 hash 校验 |
| Task / Evidence | pi-tasks public adapter | 命令与 Evidence 提交，不解析私有 entries |
| Run / WorkItem / lease | 9.42 | 启动、检查、控制与恢复 |
| board/context projection | 9.43 / ONT projection | 查询或重建，不作为写入事实 |

逻辑路径继续由 core data-root resolver 解析；Web/Desktop 只注入 root。ONT8 不增加持久化目录。

## 写入与恢复协议

```text
authorize + exact-version validation
  -> persistent intent
  -> ONT Action accepted receipt
  -> WorkItem acceptance
  -> verifier result / Evidence
  -> pi-tasks completion gate
```

operationId/requestId、payload hash、revision、cursor、attempt 与 lease epoch 用于对账。重复相同请求恢复原回执；ID 内容冲突拒绝。旧 attempt/epoch 的提交保留审计但不进入当前状态。外部副作用不可查询/去重时返回人工核对，禁止自动重发。

## Transport 设计

- Web route：解析/限制 body，注入 actor/project/data root/ports，映射 HTTP status。
- Desktop main：验证 sender、channel 与参数，注入相同 service，返回 `IpcResponse`。
- Preload：只暴露明确 allowlist 方法，不开放通用 invoke。
- 客户端：不直接改权威状态，不自动重试 mutation；冲突时刷新投影。

Web/Desktop parity tests 使用同一 fixture，比对规范化业务结果并忽略 transport 时间戳。

## 性能、安全与可观测性

- 列表 cursor 分页，默认/上限 50；详情与 artifact 按需读取。
- 权限检查先于正文读取；路径 ID 在文件访问前校验。
- 日志只含 ID、版本、revision、code、diagnosticId；无正文、凭据、绝对路径、prompt、附件字节。
- 交互 adapter 开销目标 <500ms；不得用缓存双写换取性能。
- 日志/指标失败不触发业务重试或改变回执。

## 迁移与兼容

新 canonical routes/channels 与旧 ontology API 并存；ONT8 不删除旧 API。旧项目只有显式 ONT.3 migration 后才能进入 canonical write path，且继续遵守 dry-run、备份、拒绝覆盖与回滚约束。新入口由前置 capability/compatibility gate 控制。

## AGENTS.md 符合性声明

- 符合 App Router、函数式 React、TypeScript strict、文件存储和单向依赖要求。
- Core 业务逻辑不进入 `packages/web/src/app/` 或 Desktop service。
- ONT feature 保持平台无关且不反向依赖 runtime/project。
- 所有公共 API 通过 feature/module index 导出，无跨 feature 私有 import。
- 不修改 `.next`、`dist-electron`、`node_modules` 或 runtime data。

## 风险

| 风险 | 处理 |
|---|---|
| P2.8/9.42/9.43 尚未交付 | readiness audit 硬门；缺失则返回 unavailable |
| 多事实源不能原子提交 | 持久 intent、幂等 receipt、对账恢复 |
| 旧/新 API 长期并存 | 本轮不删除；有调用证据后单独 Proposal 收敛 |
| 平台矩阵无法全自动 | 分平台保存 evidence；未执行不标通过 |

## 变更历史

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-19 | 0.1.0 | 定义共享应用服务、transport、事实源和恢复边界 |

