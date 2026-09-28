# 需求文档 - Story C.8

**Story:** Reflexion 失败反思
**Epic:** C（认知系统）
**最后更新:** 2026-07-17

---

## 概述

将 Reflexion 模式（Shinn et al. 2023）集成到 PatternProvider 中，使 Agent 在工具链失败或任务未解决时，自动生成叙事性反思（"哪里出错了，下次应该怎么做"），并存入情景记忆（Episodic Memory）。这些反思与现有的统计型模式不同——它们是 Agent 对自身失败的自我分析，用于指导下一次尝试。

### 参考材料

- `learn/ai-engineering-from-scratch/phases/14-agent-engineering/03-reflexion-verbal-rl/docs/en.md` — Reflexion 模式文档
- Reflexion 三阶段：Actor（执行）→ Evaluator（评估）→ Self-Reflector（自我反思）→ Episodic Memory（情景记忆）

---

## 动机

当前 `PatternProvider` 只跟踪聚合统计（`successRate`, `avgToolCalls`, `sampleCount`），能告诉你某个工具链"有 40% 失败率"，但无法告诉你**为什么失败、下次应该尝试什么**。

Reflexion 模式补上了这个空白：每次失败后，Agent 以自然语言写下反思，存入情景记忆。下次遇到类似场景时，这些反思被注入到 system prompt 中，指导 Agent 选择不同的工具链或策略。

---

## 验收标准

- [ ] `sync_turn()` 在检测到失败时调用 `on_failure()` 生成反思
- [ ] 反思以 JSON 格式存储在 `patterns/episodic-memory/` 目录
- [ ] `prefetch()` 返回模式 + 反思的组合结果
- [ ] 反思被注入 `system_prompt_block()` 输出中
- [ ] 记忆衰退机制生效（TTL 过期、定期压缩）
- [ ] 新反思生成时执行去重逻辑
- [ ] 反思文件不超过 100 个时不触发压缩；超过时自动合并
- [ ] 所有新增代码不破坏现有 PatternProvider 功能（registry.json、Patterns.md 保持不变）

---

## 依赖

- Story C.5（经验模式提取引擎）— 已有 `sync_turn()` 和 `on_session_end()` 基础设施
- Story C.4（实践日志记录系统）— `TurnCognitiveData` 数据结构

---

## 备注

- 反思生成需要调用 LLM，属于重量级操作，`on_failure` 应在后台异步执行，不阻塞 Agent 的主 turn 流程
- 初始实现可以用简单的 prompt 模板生成反思；后续可引入专门的 Self-Reflector agent
- Episodic Memory 的设计应与 CollaborationRuntime 的 Blackboard 事件溯源兼容，以便未来跨 session 共享反思
