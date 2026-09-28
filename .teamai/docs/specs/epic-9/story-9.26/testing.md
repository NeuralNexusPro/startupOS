# 测试 - Story 9.26

**Story:** 多 Agent 协作 Prompt 构建 — Data.md + Process.md 注入 + DAG Human-in-the-Loop
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] `ProjectCollaborationContext` 正确加载 Data.md + Process.md + Agent.md + Tool.md + Taste.md + Memory.md
- [ ] `buildCollaborationPrompt()` 生成包含 7 层结构的完整 prompt
- [ ] Layer 2 包含 Data.md 中的本体对象、字段、约束、操作权限、Agent 间数据边界
- [ ] Layer 3 包含 Process.md 中的处理步骤、验证规则、异常处理
- [ ] Layer 4 包含 Process.md 中的协作协议（被触发/触发其他）
- [ ] Layer 7 包含"禁止臆造数据"强制指令
- [ ] Agent Worker 分发逻辑正确（Data.md + Process.md 存在时走协作路径）
- [ ] `initializeOriginOSAgent()` 保持原有行为不变（单 Agent 场景不受影响）
- [ ] `initializePersistentAgent()` 保持原有行为不变（interview 场景不受影响）
- [ ] DAG `waiting` 节点状态正确（Agent 返回 waiting 时阻塞下游）
- [ ] `resumeNode()` 正确恢复节点并触发下游
- [ ] `getSnapshot()` 包含 waitingAgentIds 字段
- [ ] `respondToHumanReview()` 可通过 API 注入用户回复
- [ ] Agent prompt 中包含 Human Review 请求指令
- [ ] `npx tsc --noEmit --skipLibCheck` 零 TS 错误
- [ ] `npm run lint` 零 ESLint 错误
