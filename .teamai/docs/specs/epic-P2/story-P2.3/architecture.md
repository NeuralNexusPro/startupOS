# 架构设计 - Story P2.3

**Story:** 协作拓扑可视化
**Epic:** P2 - AI 解决方案设计
**最后更新:** 2026-04-22

---

## 已实现模块

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/components/solution/TopologyGraph.tsx` | ✅ 组件完整 | 接收 `agents` 数组，渲染节点和边 |
| `SolutionDesign.tsx` 中拓扑 Tab UI | ✅ UI 已写 | 拓扑标签页、图例 |
| `fetchManifest()` 函数 | ✅ 逻辑已写 | 从文件系统读取 manifest 并解析 |

---

## 关键 Bug 修复

### 问题定位

`src/components/solution/SolutionDesign.tsx` 第 209-210 行：

```typescript
void fetchManifest;  // ← 函数被显式废弃，不会执行
void onComplete;     // ← 回调被显式废弃，不会触发
```

### 修复方案

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

## 实现总结（2026-04-22）

| 变更 | 文件 | 说明 |
|------|------|------|
| 修复拓扑图触发 | `SolutionDesign.tsx` | 移除 `void fetchManifest`，添加 useEffect 监听 piMessages 变化 |
| 方案列表 API | `api/projects/[id]/solutions/route.ts` | 新增 GET 路由，读取 solutions/ 目录 |
| 版本列表 UI | `SolutionList.tsx` | 新增左侧侧边栏组件，5s 轮询 |
| 清理废弃 props | `SolutionDesign.tsx` + `page.tsx` | 移除未使用的 `onComplete` prop |

### 消息检测逻辑

使用正则 `/solutions\/([^\s]+\.json)/` 匹配 Skill 输出的任何 JSON 路径，解析成功后自动切换到拓扑 Tab。

---

## 修复优先级

**P2.3-1 ~ P2.3-3 是最小可行修复**，预计 2-3 小时完成，解锁整个拓扑可视化功能。

### 工作项

- [x] **P2.3-1**: 移除 `void fetchManifest` 和 `void onComplete`
- [x] **P2.3-2**: 实现 Skill 输出清单路径的约定信号（修改 SKILL.md）
- [x] **P2.3-3**: 在 `SolutionDesign.tsx` 中监听消息，检测信号并调用 `fetchManifest`
- [ ] **P2.3-4**: 验证拓扑图 Tab 正常出现并显示正确数据
- [ ] **P2.3-5**: 补充节点点击详情面板（若 TopologyGraph 尚未实现）
- [ ] **P2.3-6**: 测试方案更新后拓扑图刷新逻辑
