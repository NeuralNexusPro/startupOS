# 需求 - Story P2.4

**Story:** 沙盒推演与本体反馈回路
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 用户故事

作为方案设计者，
我想触发沙盒推演，选择典型业务场景让 AI 模拟 Agent 执行过程，
以便验证方案可行性并发现本体中的设计缺口。

---

## 验收标准

- [ ] AC1: 沙盒区域作为独立功能区展示在窗体右侧（或可切换的独立 Tab）
- [ ] AC2: AI 自动生成 3-5 个典型场景（正常流、异常流、边界情况）
- [ ] AC3: 用户选择场景后触发推演
- [ ] AC4: 推演过程逐步展示各 Agent 的响应（流式输出）
- [ ] AC5: 推演完成后展示推演报告（各 Agent 结果、总结）
- [ ] AC6: 推演完成后展示本体缺口报告（缺口类型、严重程度、修复建议）
- [ ] AC7: 发现缺口后提示用户选择：返回第一阶段修改本体 / 忽略继续
- [ ] AC8: 沙盒数据不持久化，推演结束后清理

---

## 依赖关系

### 已实现

| 内容 | 状态 | 说明 |
|------|------|------|
| `src/types/sandbox.ts` | ✅ | BusinessScenario、SimulationReport、OntologyGapReport 类型完整 |
| Skill 阶段四：沙盒推演 | ✅ | 场景生成、模拟数据生成、推演过程、报告生成 |

### 缺失部分

| 缺失点 | 说明 | 优先级 |
|--------|------|--------|
| 沙盒 UI 面板 | 无独立的场景列表 + 推演输出区域 | Critical |
| 场景选择交互 | 用户选择场景的 UI 组件 | Critical |
| 推演报告展示组件 | SimulationReport 渲染组件 | High |
| 本体缺口报告组件 | OntologyGapReport 渲染组件，含严重程度标注 | High |
| 返回第一阶段跳转 | 缺口确认后的跳转逻辑（打开本体编辑器） | Medium |

---

## 相关文档

- [Epic P2 README](../README.md)
- [PRD 3.5 沙盒执行](../../../product/phase-2-ai-solution-design.md#35-沙盒执行模拟运行)
- [PRD 3.6 本体反馈回路](../../../product/phase-2-ai-solution-design.md#36-本体反馈回路)
- [sandbox.ts 类型定义](../../../../src/types/sandbox.ts)
- [solution-design Skill 阶段四](../../../../skills/solution-design/SKILL.md)
