# 需求文档 - Story P2.8

**Story:** Workflow 设计与解决方案执行契约发布  
**版本:** 1.0  
**最后更新:** 2026-07-28

## 需求来源

- Epic P2 的 Workflow/Team 解决方案建模与执行清单目标。
- Story P2.5 的方案版本和确认锁定能力。
- Story P2.6 的 Skill/SOP I/O 契约。
- Story P2.7 的 Agent-Skill 图谱和建模维度。
- Story 9.42 对已发布、不可变执行契约的运行时依赖。

## 功能需求

### FR1: 设计态 Workflow 边界

- Workflow 是解决方案设计模型，用于表达业务阶段、依赖、Agent/Skill 分工和检查点。
- Workflow 不作为 Agent/RoleAgent 任务运行模式，也不在多 Agent runtime 中创建、编辑或重新规划。
- Team 是另一种设计视角，两种视角最终都必须编译为统一执行契约。

### FR2: 执行契约编译

- 从指定且已确认的 solution version 编译 `SolutionExecutionContract`。
- 契约必须包含 solution/version、建模维度、冻结拓扑、Agent/Skill 契约、I/O 引用、验证策略、HITL、权限和预算。
- 设计态展示字段不得被当作运行时临场决策指令。

### FR3: 发布门控

发布前必须验证：

1. solution schema 和版本状态有效。
2. 拓扑节点、边和依赖完整，无断链和非法环。
3. Agent/Skill 引用可解析且能力满足节点声明。
4. 上游输出与下游输入兼容。
5. 每个需要验收的节点具有可执行 verifier 和 evidence 要求。
6. 权限、预算、重试、HITL 和升级策略完整。

任一门控失败时，发布失败并返回结构化 `DesignGap[]`。

### FR4: 不可变版本

- 已发布契约具有稳定 `contractId` 和 `contractHash`。
- 已发布内容禁止原地修改。
- 设计调整必须产生新的 solution version 和 execution contract。
- 撤销只改变可启动状态，不重写原契约正文。

### FR5: 公共读取边界

- 通过 core 公共 API 提供按 `solutionId + solutionVersion` 精确读取和校验契约的端口。
- 运行时不得读取“latest”替代任务绑定版本。
- 运行时不得通过 LLM 补齐缺失字段。

### FR6: 兼容迁移

- legacy manifest 只能通过显式迁移流程生成新契约。
- legacy `executionMode: Workflow | System` 降级为设计维度元数据。
- 迁移必须执行与新方案相同的发布门控。

## Given/When/Then 验收

### AC1: 成功发布

**Given** 已确认的方案版本具有完整拓扑、I/O、验证和策略定义  
**When** 用户执行“发布执行契约”  
**Then** 系统生成不可变 `SolutionExecutionContract`  
**And** 保存稳定 `contractHash`，状态显示为已发布。

### AC2: 阻止不完整设计

**Given** 方案存在断链、缺失 verifier 或 I/O 不兼容  
**When** 用户尝试发布  
**Then** 系统拒绝发布  
**And** 按节点和规则显示结构化设计缺口  
**And** 不生成可启动契约。

### AC3: 不可变性

**Given** v1.0 契约已发布  
**When** 用户修改方案  
**Then** 系统要求创建新方案版本  
**And** v1.0 契约内容和 hash 保持不变。

### AC4: 精确版本消费

**Given** v1.0 和 v1.1 均存在  
**When** 运行时请求 v1.0  
**Then** 读取端口只返回 v1.0 契约  
**And** 不自动替换为 v1.1。

### AC5: 运行时边界

**Given** 契约已发布  
**When** 多 Agent runtime 启动  
**Then** runtime 只能读取和实例化契约  
**And** 没有 Workflow 编辑、生成、选择或热更新接口。

## 边界与异常

- 空拓扑、孤立节点、重复 ID、未知 Agent/Skill、循环依赖：拒绝发布。
- verifier 为占位实现或没有 evidence schema：拒绝发布。
- 权限超过 Agent 工具权限：拒绝发布并列出冲突项。
- solution version 已发布：拒绝覆盖，提示创建新版本。
- contract 文件损坏或 hash 不一致：读取失败并标记完整性错误。
- 方案被撤销：保留历史查询能力，但禁止新 runtime 启动。

## 非功能需求

- 发布校验目标时间小于 5 秒，不包含外部模型推理。
- 编译结果必须确定性：相同规范化输入生成相同 hash。
- 本地 JSON 持久化采用原子写入，禁止半写入契约。
- 核心编译、校验和 hash 逻辑单元测试覆盖率不低于 80%。
- 不记录凭据、任务正文或大体积 artifact 内容。

## 非目标

- 不实现多 Agent 调度、Worker、Verifier 执行或 HITL 运行。
- 不实现 Agent/RoleAgent 输入框任务入口。
- 不定义 `pi-tasks` Task/Step 生命周期。
- 不允许运行时动态 Workflow。

## 依赖关系

| 类型 | Story | 内容 |
|------|-------|------|
| 前置 | P2.5 | 方案版本、确认和 manifest |
| 前置 | P2.6 | I/O 契约 |
| 前置 | P2.7 | Workflow/Team 和 Agent-Skill 拓扑 |
| 后续 | 9.42 | 读取契约并实例化多 Agent 任务 |

## 变更历史

| 日期 | 变更内容 | 原因 |
|------|---------|------|
| 2026-07-28 | 初始版本 | 明确 Workflow 设计态归属和执行契约发布边界 |

## 2026-09-14：项目语义执行规划补充

执行契约必须包含semanticContext：精确本体版本、访谈证据、对象槽位、输入事实/状态与新鲜度、输出/Action/验收约束、任务模板和候选执行者。未确认概念、歧义和未绑定输入形成DesignGap。

Given已确认访谈与合法方案，When发布，Then上下文与拓扑共同纳入不可变contractHash。Given旧任务运行中，When发布新版本，Then旧run不自动更新，新Task才可选择新契约。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
