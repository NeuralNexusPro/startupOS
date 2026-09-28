# 测试文档 - Story M.11

**Story:** 用 Memory Core 统一 history-to-cognition 管线并替代 Dream
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

1. - [x] memory-core 提供明确的 history-to-cognition consolidation 入口
2. - [x] `Dream` 不再是长期记忆主路径依赖
3. - [x] `Memory.md` 停止接收 turn 级流水摘要
4. - [x] Recall、稳定记忆、Pattern/Reflection 的边界文档化且实现对齐
5. - [x] 新增测试覆盖：同一段 history 被正确分类到 recall / stable memory / pattern 三种落点
6. - [x] OS 层文档明确只消费 memory-core 产物，不再独立整理长期记忆

---

## 测试场景

### 1. Consolidation 入口测试

**测试目标：** 验证 history-to-cognition consolidation 正确分类与沉淀

| 场景 | 输入 | 预期输出 |
|------|------|---------|
| 用户偏好信号 | history 中包含"我喜欢用 TypeScript" | 分类到 `stable_memory`，写入 `Memory.md` 核心块 |
| 临时计划 | history 中包含"我先试试这个方案" | 仅保留在 `recall`，不进入 `stable_memory` |
| 工具使用成功模式 | 多次 turn 中 `read_file → write_file` 成功 | 分类到 `pattern`，写入 pattern registry |
| 工具使用失败反思 | turn 中工具链失败并有用户纠正 | 分类到 `reflection`，写入 archival |
| 稳定事实 | history 中包含"项目使用 Next.js 14" | 分类到 `stable_memory` |
| loop 噪声 | 重复循环的无意义 turn | 仅保留在 `recall`，不固化到长期记忆 |

### 2. 旧路径停用测试

**测试目标：** 验证 Dream 和 flushMemory 不再直写 `Memory.md`

| 场景 | 预期行为 |
|------|---------|
| `MemoryTracker.flushMemory()` 调用 | turn 摘要只写入 history/recall store，`Memory.md` 无新增内容 |
| Dream 代码路径触发 | 不直接编辑 `Memory.md`，委托给 consolidation pipeline |
| `Memory.md` 写入审计 | 唯一写入入口为 memory-core consolidation |

### 3. 统一消费接口测试

**测试目标：** 验证各查询接口返回正确分类的产物

| 接口 | 预期返回 |
|------|---------|
| `recent_history` | 最近 N 轮的原始历史，不含长期记忆 |
| `stable_memory` | 用户偏好、长期约束、稳定事实等核心块 |
| `pattern` | 成功模式、工具使用经验 |
| `reflection` | 失败反思、反模式 |
| `knowledge_candidate` | 可上升为 wiki / ontology 的结构化知识候选 |

### 4. 多启动方式消费 Contract 测试

**测试目标：** 验证所有 Agent 启动方式统一消费 memory-core 产物

| 启动方式 | 预期行为 |
|---------|---------|
| `project` | 通过 memory-core 统一接口获取记忆产物 |
| `agent` | 同上 |
| `skill` | 同上 |
| `role-agent` | 同上，MemoryTracker / Dream 不再独立整理 |
| `persistent project agent` | 同上 |
| `multi-agent` | 同上 |

### 5. 迁移回归测试

**测试目标：** 验证现有 Agent 历史数据在新模型下正确分类

| 场景 | 预期行为 |
|------|---------|
| RoleAgent 历史样本迁移 | 用户偏好、长期约束正确沉淀到 `stable_memory` |
| ProjectAgent 历史样本迁移 | 临时计划、loop 噪声不进入 `Memory.md` |
| 多 Agent 历史样本迁移 | 各 Agent 记忆隔离，分类正确 |
