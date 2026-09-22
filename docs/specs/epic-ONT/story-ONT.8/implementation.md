# ONT.8 实施

**Story:** Cross-package Adapters 与端到端验证  
**版本:** 0.1.0  
**最后更新:** 2026-09-19

## 开发目标

在不修改 ONT.1–ONT.7 语义、不补造 P2.8/9.42/9.43 的前提下，实现一个共享 core application service、两个薄 transport adapter 和一套真实跨包验收夹具。

## 前置门

实施前必须完成：

1. `integrate-ontology-cross-package-adapters` strict validation 与用户明确批准。
2. P2.8 可发布、精确读取并校验不可变 execution contract。
3. 9.42 可绑定/恢复 Task、Run、WorkItem、attempt、lease。
4. 9.43 可查询/控制同一 project task projection。
5. pi-tasks public adapter 的 revision/cursor、幂等 replay 与 Evidence Gate 可用。

缺少任一项时只提交 readiness gap，不开始应用源码，也不使用私有 API 绕过。

## 实施步骤

### 1. Core contract 与应用服务

- 在 `packages/core/src/lib/features/project/` 复用或补充 `types.ts`，定义最小版本化 request/result/error。
- 通过公共 `index.ts`/依赖注入组合 ONT、solution、task runtime、collaboration 与 projection ports。
- 实现 exact scope、权限、expected revision/epoch 门控和只读聚合。
- 实现 intent → receipt → acceptance → Evidence 的幂等对账与恢复。
- 添加正反例、重复请求、崩溃点、旧 epoch、跨项目和投影重建测试。

### 2. Web adapter

- 在 `packages/web/src/app/api/` 增加最小 routes；具体路径以现有 project task API 命名为准，避免第二套平行资源模型。
- route 只解析 body/path、构造授权环境、调用 core service、映射 status/response。
- 添加 route contract tests，证明非法输入在业务调用前拒绝、Core errors 稳定映射且无敏感字段。

### 3. Desktop adapter

- 在 `packages/desktop/src/main/` 增加或扩展项目任务/ontology service handler。
- 在共享 IPC protocol 与 preload allowlist 暴露精确方法，不开放通用 channel。
- 添加 sender、参数、错误、module resolution 与 cleanup tests。

Core contract 冻结后步骤 2 与 3 可在互不重叠的 Task worktree 并行。

### 4. Parity 与 E2E

- 用同一 fixture 驱动 Core、Web 与 Desktop contract tests。
- 在临时 data root 创建 canonical 新项目与 legacy 只读项目。
- 执行 E01–E16；故障注入点覆盖 intent、Action、acceptance、Evidence 前后。
- 比较 Web/Desktop 规范化输出，不比较 transport 时间戳。
- 验证 1000 Task、50 条分页和多个 Agent 更新，不全量加载正文。

### 5. Platform packaging

- 验证 development、Windows x64、macOS x64/arm64 的公共模块解析、preload channel、启动与强退恢复。
- 每个平台保存独立命令、构建信息和日志摘要；未运行项保持未验证。
- 不修改 `dist-electron/` 或 release artifact 作为修复入口。

## 文件级写入边界

| 工作包 | 允许写入 | 禁止写入 |
|---|---|---|
| Core | `packages/core/src/lib/features/project/` 及对应 tests | Web/Desktop、ONT private internals |
| Web | `packages/web/src/app/api/` ONT8 routes/tests | core 业务规则、Desktop |
| Desktop | `packages/desktop/src/main/`、preload/IPC contract/tests | Web、core 业务规则、编译产物 |
| QA | 跨包 fixture、E2E scripts、本 Story testing evidence | 前三工作包实现文件 |

应用源码必须由独立 subagent Task branch/worktree 实施；Proposal worktree 只维护规格、编排、集成和验证。

## 兼容与回滚

- 新入口与旧 ontology/entity API 并存；不自动迁移、不删旧文件。
- 旧项目仅只读/legacy 使用，显式 ONT.3 migration 后再进入 canonical write path。
- 回滚时禁用/移除新 route、IPC channel 与 service 装配；不删除已 accepted ontology facts、operations、Task/Run entries 或 Evidence。
- 未知外部副作用保留人工核对状态，不用回滚脚本盲目补偿。

## 审查要点

- 无 route/IPC 业务逻辑复制，无跨 feature 私有 import 或 integration 反向依赖。
- 无 `latest` 隐式切换、无 UI 乐观写权威状态、无第二 Task/Run/ontology 状态文件。
- 所有 mutation 有 request/operation ID、expected revision、attempt/epoch 和恢复测试。
- 授权先于正文读取；错误/日志无敏感内容。
- 未执行平台或前置依赖不被标记完成。

## Proposal 映射

唯一 Proposal：[`integrate-ontology-cross-package-adapters`](../../../../openspec/changes/integrate-ontology-cross-package-adapters/proposal.md)。其 `tasks.md` 中 ONT8-T1-A 至 ONT8-T1-M 是本 Story 的实施工作包，不再拆出第二个 ONT8-T1 Proposal。

## 变更历史

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-19 | 0.1.0 | 定义前置门、隔离实施范围、上线与回滚步骤 |

