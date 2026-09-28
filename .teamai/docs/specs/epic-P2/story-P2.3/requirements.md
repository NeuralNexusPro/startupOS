# 需求 - Story P2.3

**Story:** 协作拓扑可视化
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 用户故事

作为方案设计者，
我想在方案编辑区看到 Agent 协作拓扑图，并能点击节点查看 Agent 详情，
以便直观理解整体架构。

---

## 验收标准

- [ ] AC1: Skill 生成执行清单后，拓扑图 Tab 自动出现并可切换
- [ ] AC2: 节点展示 Agent/RoleAgent，颜色区分两种类型
- [ ] AC3: 边展示协作关系（trigger / notify / depend），颜色区分
- [ ] AC4: 点击节点可查看 Agent 详情（名称、职责、业务领域、本体对象）
- [ ] AC5: 用户调整方案后（对话修改），拓扑图自动更新
- [ ] AC6: 渲染时间 < 2 秒

---

## 依赖关系

### 已实现

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/components/solution/TopologyGraph.tsx` | ✅ 组件完整 | 接收 `agents` 数组，渲染节点和边 |
| `SolutionDesign.tsx` 中拓扑 Tab UI | ✅ UI 已写 | 拓扑标签页、图例 |
| `fetchManifest()` 函数 | ✅ 逻辑已写 | 从文件系统读取 manifest 并解析 |

### 关键 Bug（阻塞 AC1）

`src/components/solution/SolutionDesign.tsx` 第 209-210 行：

```typescript
void fetchManifest;  // ← 函数被显式废弃，不会执行
void onComplete;     // ← 回调被显式废弃，不会触发
```

**修复方案：**

Skill 在生成执行清单时，通过 pi-agent 消息通知前端。需要在消息处理中检测清单路径并调用 `fetchManifest`：

```typescript
// 在 piMessages 变化的 useEffect 中扫描最新 assistant 消息
// 检测是否包含 manifest 路径信号，如：
// "执行清单已保存到：solutions/solution-v1.0-manifest.json"
useEffect(() => {
  const lastMsg = piMessages?.[piMessages.length - 1];
  if (lastMsg?.role === 'assistant' && lastMsg.content.includes('manifest.json')) {
    const match = lastMsg.content.match(/solutions\/[^\s]+manifest\.json/);
    if (match) fetchManifest(match[0]);
  }
}, [piMessages]);
```

或者让 Skill 在生成清单后输出约定格式的信号：`__MANIFEST__: solutions/solution-v1.0-manifest.json`

---

## 相关文档

- [Epic P2 README](../README.md)
- [PRD 3.4 协作拓扑可视化](../../../product/phase-2-ai-solution-design.md#34-协作拓扑可视化)
- [SolutionDesign.tsx](../../../../src/components/solution/SolutionDesign.tsx)
- [TopologyGraph.tsx](../../../../src/components/solution/TopologyGraph.tsx)
- [solution-design Skill 阶段五](../../../../skills/solution-design/SKILL.md)
