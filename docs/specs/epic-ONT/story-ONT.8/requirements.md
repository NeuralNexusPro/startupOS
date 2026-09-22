# ONT.8 需求

**Story:** Cross-package Adapters 与端到端验证  
**版本:** 0.1.0  
**最后更新:** 2026-09-19

## 需求来源

- Epic ONT 对 Web API、Desktop IPC、P2/runtime integration tests 的交付边界。
- [项目语义上下文与任务驱动多 Agent 实施规划](../project-semantic-execution-plan.md)中的 ONT8-T1 与 E01–E16。
- ONT.1–ONT.7 已发布的 canonical schema、store、migration、validator、OSDK、contract validation 与 context projection 公共契约。
- P2.8、9.42、9.43 对执行契约、Run/WorkItem、任务投影与恢复的需求。

## 功能需求

### FR1：共享业务入口

Web API 与 Desktop IPC 必须调用同一 core 项目语义执行应用服务。route、IPC handler 和 preload 只负责 trust boundary 校验、依赖注入与 transport 映射，不得复制 ontology 转换、Validator、Action Gate、幂等或恢复规则。

### FR2：精确上下文门控

每个写操作按用途携带并验证 project、ontology ID/version、contract ID/hash、task、session、branch、run、work item、attempt、lease epoch、request/operation ID、expected revision 和精确权限集合。禁止读取 latest 替换绑定版本；缺失、过期、越权或冲突均在副作用前拒绝。

### FR3：事实源与投影边界

- ONT store/OSDK 拥有 ontology、facts、Action receipt。
- P2.8 contract store 拥有不可变执行契约。
- pi-tasks current branch 拥有 Task、Criterion、Evidence、Blocker。
- 9.42 runtime ledger 拥有 Run、WorkItem、attempt、lease。
- 9.43/ONT projection 只提供可重建查询视图。

ONT8 不新增统一状态文件，不直接修改 JSONL、private session entries 或 UI store 来表达业务完成。

### FR4：提交与恢复

写链路遵循 persistent intent → ONT Action/accepted receipt → WorkItem acceptance → verified Evidence → Task completion gate。相同请求重试返回原回执；不同内容复用 ID 拒绝。进程在任一提交点退出后只补登记缺失步骤，不重复不可逆副作用。不可查询且无幂等回执的外部操作进入人工核对。

### FR5：Transport 等价与错误契约

Web 和 Desktop 对等输入必须返回等价数据、revision、receipt 与稳定错误 code。授权、冲突、不可用和内部故障必须结构化，并不得泄露其他项目正文、凭据、绝对路径、prompt、附件字节或完整工具输出。

### FR6：联合验收

E01–E16 必须使用临时项目中的真实文件持久化与公共 adapter 验收，覆盖访谈来源、DesignGap、精确版本、并发、Verifier/Evidence、看板一致性、权限、投影重建、1000 Task/50 条分页和中断恢复。mock 只可用于不可控外部依赖，不能代替提交或恢复结果。

### FR7：平台与旧项目兼容

development、Windows x64、macOS x64/arm64 必须分别验证公共模块解析、preload allowlist、IPC 调用和进程退出恢复。旧项目继续使用既有只读/legacy 路径，除非用户显式执行 ONT.3 migration；读取、启动或升级不得静默写入 canonical 数据。

## Given / When / Then 验收

### AC1：跨 transport 等价

**Given** 同一授权主体与同一项目上下文  
**When** 分别通过 Web API 和 Desktop IPC 查询或提交  
**Then** 返回等价的业务结果、revision/receipt 或稳定错误，且边界层无复制业务逻辑。

### AC2：版本与 lease 隔离

**Given** v1 run 执行期间发布 v2，或 work item 已重分配  
**When** v1 当前 attempt 继续执行，或旧 epoch 迟到提交  
**Then** v1 不切换 latest；旧 epoch 被拒绝且不能覆盖当前结果。

### AC3：Evidence Gate

**Given** WorkItem 自报完成但 verifier 失败或 Criterion 缺 Evidence  
**When** 运行链路尝试完成父 Task  
**Then** Task 保持未完成，不生成伪 passed Evidence 或第二套完成状态。

### AC4：中断恢复

**Given** 进程分别在 intent、Action、接纳和 Evidence 边界退出  
**When** 重新打开原项目任务并恢复  
**Then** 系统从权威 ledger 对账，只补缺失记录，无重复 Action/fact/Evidence 和幽灵完成。

### AC5：不可判定副作用

**Given** 外部操作已发出但无法查询或去重  
**When** 恢复方无法证明结果  
**Then** 标记待人工核对，不自动重发或完成任务。

### AC6：看板一致性与并发

**Given** 看板与协同图同时打开且两个客户端基于同一 revision 操作  
**When** 一个请求先提交、另一个请求随后提交  
**Then** 后者收到冲突并刷新权威投影；两视图最终显示相同 Task/Run/WorkItem revision。

### AC7：安全与旧项目

**Given** 非授权项目请求或未显式迁移的旧项目  
**When** 用户通过任一 transport 访问  
**Then** 前者在读取正文前被拒绝且不泄露目标；后者保持原读取行为且不静默迁移。

### AC8：平台验收

**Given** 支持平台的实际 Desktop 包  
**When** 执行启动、模块解析、preload、任务中断和恢复 smoke  
**Then** 每个平台保存独立 evidence；失败或未执行的平台阻止 ONT8-T1 完成声明。

## 边界与异常

- 空/非法 projectId、路径分隔符、绝对路径：文件访问前拒绝。
- ontology/contract/hash/revision 不匹配：拒绝且不写 intent。
- P2.8、9.42、9.43 或 task adapter 不可用：返回 unavailable，不走 legacy 私有接口。
- 投影缺失：从事实源重建；权威 ledger 损坏：明确阻塞，不猜测。
- 重复 requestId/operationId 同内容：返回原结果；不同内容：冲突。
- paused 不自动继续；cancelled 不复活；pending approval 恢复原请求。

## 依赖关系

| 类型 | Story / Capability | 要求 |
|---|---|---|
| 前置 | ONT.1–ONT.7 | 公共 schema、store、migration、validator、OSDK、contract/projection protocol 可用 |
| 前置 | P2.8 | 已发布不可变 contract 可精确读取并校验 hash |
| 前置 | 9.42 | Task/Run/WorkItem/attempt/lease 与恢复公共端口可用 |
| 前置 | 9.43 | 项目任务投影与命令公共端口可用 |
| 前置 | pi-task-public-command-adapter | Evidence Gate、revision/cursor、幂等 replay 可用 |
| 后续 | Epic C/M/T | 只能消费有界 projection/query，不直接写 canonical 数据 |

## 非功能需求

- CUI/任务控制的 adapter 开销满足现有 500ms 交互目标；外部模型时间不计入。
- 列表默认 50 条 cursor 分页；1000 Task 不全量加载或渲染。
- TypeScript strict，禁止 `any`；不新增依赖、数据库或后端框架。
- 核心 gate/recovery 逻辑分支必须有自动化测试；跨包关键路径与 E01–E16 需逐项 evidence。
- 日志失败不得改变业务结果；敏感正文和凭据不进入日志、投影或错误响应。

## 非目标

- 不实现或重写 P2.8、9.42、9.43。
- 不新增 Workflow runtime、任务调度器、业务事实副本或自动迁移。
- 不删除旧 ontology API，不引入通用 RPC 框架或新的 UI 框架。

## 变更历史

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-19 | 0.1.0 | 初始需求，覆盖跨包适配、E01–E16、恢复与平台矩阵 |

