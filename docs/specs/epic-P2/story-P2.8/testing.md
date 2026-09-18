# 测试文档 - Story P2.8

**Story:** Workflow 设计与解决方案执行契约发布  
**版本:** 1.0  
**最后更新:** 2026-07-28

## 测试目标

验证 Workflow 只属于解决方案设计阶段，已确认方案能通过严格门控发布为不可变执行契约，运行时只能精确读取已发布版本。

## 自动化测试矩阵

| ID | 层级 | 场景 | 预期结果 |
|----|------|------|---------|
| TC-U1 | Unit | 相同规范化方案重复编译 | JSON 与 contractHash 完全一致 |
| TC-U2 | Unit | 拓扑含断链、未知节点或非法环 | 返回可定位 DesignGap，禁止发布 |
| TC-U3 | Unit | 上游输出与下游输入不兼容 | I/O 门控失败 |
| TC-U4 | Unit | 节点缺失 verifier/evidence schema | 验证门控失败，不填默认 passed |
| TC-U5 | Unit | 权限超出 Agent 工具权限 | 权限门控失败 |
| TC-U6 | Unit | 读取后正文被篡改 | hash 校验失败 |
| TC-I1 | Integration | confirmed solution 完整发布 | 原子生成 approved contract |
| TC-I2 | Integration | draft solution 尝试发布 | 拒绝发布 |
| TC-I3 | Integration | 已发布版本再次写入 | 拒绝覆盖，原文件和 hash 不变 |
| TC-I4 | Integration | v1.0 与 v1.1 并存，读取 v1.0 | 精确返回 v1.0，不使用 latest |
| TC-I5 | Integration | legacy manifest 显式迁移 | 经完整门控后发布或返回 DesignGap |
| TC-C1 | Component | 发布检查存在阻断项 | 显示分类错误并禁用发布 |
| TC-C2 | Component | 发布成功 | 显示只读 contractId/version/hash |
| TC-E1 | E2E | 编辑、检查、确认、发布 | 完成设计态闭环，发布后只读 |
| TC-E2 | E2E | 修改已发布方案 | 要求创建新版本，不修改旧契约 |
| TC-A1 | Architecture | 扫描 runtime 公共 API | 无 Workflow 创建、编辑、选择或编译接口 |

## Given/When/Then

### 成功发布

**Given** 已确认方案具有完整拓扑、I/O、verifier 和策略  
**When** 执行发布  
**Then** 生成 approved contract 和稳定 hash  
**And** 重新读取后完整性校验通过。

### 设计缺口

**Given** 某 Skill 输出与下游输入不兼容  
**When** 执行检查或发布  
**Then** 返回关联节点/边的 DesignGap  
**And** 不产生 contract 文件。

### 不可变版本

**Given** v1.0 已发布  
**When** 修改方案并再次保存  
**Then** 要求创建 v1.1  
**And** v1.0 文件内容、时间和 hash 不变。

### 运行时边界

**Given** P2.8 公共 API 已导出  
**When** 检查 collaboration runtime 依赖  
**Then** runtime 仅能 load/verify approved contract  
**And** 无设计态 Workflow 编辑或编译依赖。

## 失败路径与边界

- 空方案、空 topology、单节点方案。
- 重复 node ID、缺失 edge endpoint、非法自环。
- 未知 Skill/Agent 引用。
- verifier 配置存在但实现不可解析。
- 预算为零、负值或超上限。
- 两个并发发布请求竞争同一版本。
- 原子写入中断后不留下可读半成品。
- revoked contract 可审计但不可供新运行启动。

## 性能验证

- 使用中等规模方案验证发布校验小于 5 秒。
- 监测 Electron main event loop，校验与写入期间不得出现明显阻塞。
- 大字段只传引用，不在 IPC 中复制 artifact 正文。

## 回归范围

- P2.5 版本列表、确认和 manifest。
- P2.6 I/O 契约校验。
- P2.7 Workflow/Team 图谱和 Agent-Skill 节点。
- Story 9.42 contract consumer fixture 兼容测试。

## 自动化测试验证 Goal

实现完成后必须创建 Goal：

> 通过 Story P2.8 testing.md 中定义的测试 case，并为每个失败项记录原因、修复结果和可复核 evidence。

若 E2E 或签名环境无法自动化，Goal 必须说明人工步骤和剩余风险，不得把未验证项标记为通过。

## 完成标准

- [ ] 核心成功路径、失败路径和边界测试通过。
- [ ] 编译、校验、hash 核心逻辑覆盖率不低于 80%。
- [ ] 关键集成点全部有自动化测试。
- [ ] 架构测试证明 runtime 不包含 Workflow 设计能力。
- [ ] 验证 Goal 完成并保存 evidence。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 初始测试设计 |

## 2026-09-14：项目语义执行规划补充

以下全部待执行。

| ID | 场景 | 预期 |
|---|---|---|
| SC01 | 未确认概念/对象歧义 | 定位DesignGap，不发布 |
| SC02 | 下游所需状态无法由上游达到 | 语义连通性失败 |
| SC03 | 相同模型重复编译 | 上下文及contractHash一致 |
| SC04 | 本体版本/Action权限/新鲜度策略变化 | 新版本与新hash |
| SC05 | 发布后被9.42精确读取 | 保留访谈证据、语义类型及模板引用 |
| SC06 | v2发布时v1仍运行 | v1不热更新 |


完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
