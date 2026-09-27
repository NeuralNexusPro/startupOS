# 契约生成边界设计

## Context
旧类型只含 objectType/fields，运行时需要精确语义引用。现有 ONT Validator 为事实连通唯一实现，Solution Validator 负责 DAG、发布策略。

## Goals / Non-Goals
目标：生成端直接产出可被当前发布链路读取的设计，Skill 创建与加载不丢契约。
不自动把中文对象名映射为 Concept，不填造 FactType、权限或 verifier，不另建校验事实源。

## Decisions
- canonical contract 是执行依据；旧 inputContract/outputContract/sopIO 保留为兼容展示，不可单独授权执行。替代方案自动转换会猜测引用，拒绝采用。
- 字段类型/覆盖通过同一版本的完整 FactType schema 保证；步骤显式 node/edge，复用 ONT 连通和 Solution DAG 校验，不复制规则。
- Stage 2.5、manifest/agents/skills 三文件和 project-skill-creator 交接统一；提供可执行的设计 fixture，覆盖成功发布、缺引用、旧格式拒绝、环/断链、版本错误。
- 业务逻辑仅在 core feature 公共入口，integrations 不依赖 feature；UI/桌面不复制逻辑。新增类型通过公共类型层供元数据使用。
- 已发布执行契约不可覆盖，旧文件不改；本任务不引入并发写入或运行状态。

## Risks / Trade-offs
生成模型可能仍漏字段 → 依靠确定性发布门控给出缺口。
旧需求字段覆盖文字与 canonical 不同 → 更新 Story 验收映射，明确旧展示兼容和执行门控边界。

## 实施边界
单一 subagent 串行负责 templates/skills/solution-design、project-skill-creator，core types/skills/project/solution 相关实现与测试，P2.6 文档；不修改 topology UI 或协同运行时。父代理只做规格、审查和集成。

## Migration Plan
不迁移数据。Task 合入 Proposal 后定向回归及架构检查，集成到本地 0.4.x；用户要求保留现场，因此不清理现存 worktree、临时目录或打包产物。
