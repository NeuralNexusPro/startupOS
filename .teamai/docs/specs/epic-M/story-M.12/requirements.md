# 需求文档 - Story M.12

**Story:** Hindsight-inspired 全局用户认知与 Agent 世界模型分域  
**版本:** 1.0  
**最后更新:** 2026-08-28

## 需求来源

- 用户要求：个人风格属于全局用户 Profile，不跟随 agent、roleagent 或 skill 产物。
- Epic M.11 遗留：`MemoryCore(agentDir)` 仍把 `human`、`persona`、project memory 写入同一目录。
- Hindsight 参考：world facts、experiences、evidence-backed observations、mental models；retain / recall / reflect；bank 隔离。
- OriginOS 约束：本地 JSON 文件、无数据库、core 单向依赖、DataFile 包装。

## 详细需求

### FR-M12-1：认知所有权分域

系统必须区分 `user`、`agent`、`project`、`session` 四类 scope。用户偏好、沟通方式、审美、长期边界属于 user scope；Agent 身份属于 Agent.md/Role.md；世界知识、执行经验、观察与模型属于 agent 或 project scope；临时对话属于 session recall。

### FR-M12-2：Hindsight-inspired 认知类型

Memory Core 必须支持：`world_fact`、`experience`、`observation`、`mental_model`。Observation 必须包含证据引用与 proof count；相反证据不得静默覆盖旧认知，而应降低置信度或生成冲突状态。

### FR-M12-3：三操作模型

- `retain`：从 turn/tool result 产生带 scope、来源、时间与证据的候选事实或经验。
- `recall`：并行使用语义、关键词、时间与关系信号，结果按统一结构返回；MVP 可按已有能力逐步启用。
- `reflect`：从多条事实/经验形成 observation，并刷新预定义 mental model 页面。

### FR-M12-4：全局用户 Profile

所有启动方式使用明确 `userId` 加载同一用户认知。默认单用户模式使用 `default`，不得通过复制 `Taste.md` 或 `human` block 到运行目录来模拟全局配置。

### FR-M12-5：组合上下文

Prompt 组合顺序固定为：全局用户 Profile → 当前 Agent 身份/角色 → Agent 世界模型 → Project 上下文 → Session recall。全局 Profile 为只读快照；Agent 工具不能直接改写它，用户信号须通过受控 retain/consolidate 流程提交。

### FR-M12-6：迁移兼容

旧 Agent `Memory.md` 中 human block 首次读取时可导入全局用户候选区，但必须带 legacy 来源并等待确认或达到证据阈值；迁移完成后 Agent 路径不再写 human block。

### FR-M12-7：场景化 Observation Policy

系统必须使用“统一 Observation Engine + 场景策略”，不得对 RoleAgent、Project 与 Skill 使用同一套观察提示词、晋升阈值和输出规则：

- **RoleAgent**：观察可跨任务复用的领域事实、专业判断、角色能力边界与执行经验；Knowledge/Pattern 归属当前 Agent。
- **Project**：观察项目需求、约束、决策、实体关系、风险与状态变化；Knowledge/Pattern 归属当前 Project，并支持事实有效期与决策替代关系。
- **Standalone Skill**：只保留 session recall 和业务产物，默认不得创建持久 Knowledge、Pattern 或 cognition bank。
- **Inherited Skill**：Skill 被 Project 或 RoleAgent 调用时只作为 evidence producer，继承调用方的 cognition owner 和 Observation Policy，不建立 Skill 自有长期认知。

策略解析必须同时考虑 `entryType`、调用方 ownership context 和运行目录；不得仅凭 Skill 名称或 `agentBaseDir` 推断认知归属。

### FR-M12-8：Knowledge / Pattern 路由边界

- `world_fact` 与证据充分的 `observation` 路由到现有 KnowledgeProvider，形成 ontology/wiki/Knowledge.md。
- `experience`、用户纠正、工具成功/失败结果路由到现有 PatternProvider，形成 positive pattern、anti-pattern、reflection 和 Patterns.md。
- Mental Model 是 Knowledge 的物化认知视图，不直接作为 Pattern。
- 用户偏好和个人风格始终路由到全局 User Profile，不得进入 RoleAgent/Project Knowledge 或 Pattern。
- PatternProvider 主体逻辑应复用，新增 ownership、evidence、proofCount、applicability 与幂等契约；不得为三种场景复制三套 Pattern 实现。

## Given / When / Then 验收标准

1. **Given** 两个不同 Agent 使用相同 userId，**When** Agent A 沉淀用户偏好，**Then** 偏好只出现在用户目录，Agent B 能在下次启动读取，两个 Agent 目录均无副本。
2. **Given** RoleAgent 多次成功使用同一工具链，**When** reflect 运行，**Then** 其 Agent bank 形成带证据和 proof count 的 observation，不写入用户 Profile。
3. **Given** Skill 会话启动，**When** 构建 prompt，**Then** 可读取全局用户 Profile 的快照，但 Skill 工作目录不生成 Profile/Taste 副本。
4. **Given** 新证据与既有偏好冲突，**When** retain + reflect，**Then** 旧观察保留证据并被修订/标记冲突，不被无痕覆盖。
5. **Given** 缺失 userId，**When** 单用户运行时启动，**Then** 使用 `default`；多用户模式必须拒绝隐式回退。
6. **Given** 同一事实分别出现在 RoleAgent 与 Project，**When** reflect 运行，**Then** 分别按 role-wide 与 project-local 策略写入不同 bank，不交叉召回。
7. **Given** Standalone Skill 完成工具调用，**When** session 结束，**Then** Skill 目录不生成 Knowledge.md、Patterns.md 或 cognition bank。
8. **Given** Skill 在 Project 内被调用，**When** 产生事实和成功工具经验，**Then** evidence 分别提交给 Project KnowledgeProvider 与 PatternProvider，并记录 `sourceSkillId`。
9. **Given** Project 事实被新决策替代，**When** 新证据进入，**Then** 旧事实关闭有效期并建立 supersedes 关系，而不是简单覆盖或当作永久冲突。

## 边界与异常

- 空消息、模型输出和纯临时计划只进入 recall，不形成长期认知。
- 密钥、token、身份证号等敏感内容在 retain 前阻断或脱敏。
- JSON 损坏时隔离损坏文件并从版本文件恢复；不得跨 user/agent scope 回退读取。
- 单条 evidence 最大 4 KiB；mental model 默认 prompt 注入预算 2,000 tokens。
- Skill 无明确调用方 ownership context 时必须按 Standalone Skill 处理，禁止猜测归属。

## 依赖与非功能要求

- 前置：M.8、M.9、M.10、M.11。
- 核心逻辑单元测试覆盖率 ≥80%，scope 隔离集成点覆盖 100%。
- 本地 recall p95 <200ms；启动时读取已物化 mental model 不触发 LLM。
- 所有 JSON 使用 `version/createdAt/updatedAt/data` DataFile 格式。
