# P2.6 契约生成与消费闭环

## Why
设计 Skill 生成旧 I/O 字段，发布端却只接受 canonical contract，导致设计看似完成却无法运行。统一生成、加载和校验边界，保留旧文件只读兼容。

## What Changes
- epic-id: P2；story-id: P2.6；task-id: P26-T1；owner: Codex。
- 来源：docs/specs/epic-P2/story-P2.6/requirements.md。
- Stage 2.5 和技能创建交接使用带 ontology/version、FactType、Action、权限的精确契约；步骤使用 topology node/edge 和 externalInputs。
- 对齐版本化 bundle 和发布端格式，缺失绑定返回可定位缺口，不猜测或静默迁移。
- 补齐技能元数据保留、生成样例到发布的回归验证和 Story 验收映射。
- 用户“帮我按照这个推进吧”已批准三项补齐范围；本任务为其中第一个。按用户要求从 0.4.x 集成，本轮不推送或合并 dev。

## Capabilities
### New Capabilities
- `solution-sop-contract-authoring`: 新方案生成契约到发布校验的闭环。
### Modified Capabilities
无；复用既有 ontology-contract-validation 和 solution-execution-contract-publishing 门控。

## Impact
涉及 templates/skills、core types、skills/project/solution 公共服务和测试。无新数据库、IPC、外部依赖和打包改动。
依赖 ONT.7、P2.8 已有公共校验/发布服务。
非目标：推断缺失权限、本体迁移、自动执行、P2.7 UI、9.36 调度。
上线为随 0.4.x 源码集成；回滚为撤回本任务提交，不改已发布契约和用户运行数据。
