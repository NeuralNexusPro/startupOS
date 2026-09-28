# 测试文档 - Story OS.17

**Story:** 无项目首页与 Agent 思考内容显示优化
**版本:** 1.0
**最后更新:** 2026-07-22

---

## 测试目标

验证无项目首页默认应用不重复、Dock 状态恢复幂等，以及所有 Agent 用户窗体不展示内部 thinking / turn 内容。

---

## 自动化测试用例

### TC1: 无项目首页只渲染一套默认应用

**类型:** 组件测试或 Playwright E2E  
**覆盖:** AC1

**Given** mock `/api/projects` 返回空数组  
**When** 打开 `/`  
**Then** 每个 `HOME_APPS` 的 `id` 或 `tourId` 在 DOM 中最多出现一次  
**And** 页面存在创建项目按钮和 Spotlight 提示  
**And** 页面只有一个“应用启动器”区域

建议断言：

```typescript
for (const app of HOME_APPS) {
  await expect(page.locator(`[data-tour="${app.id}"]`)).toHaveCount(1);
}
await expect(page.getByText('应用启动器')).toHaveCount(1);
```

### TC2: 有项目首页不回归

**类型:** 组件测试或 Playwright E2E  
**覆盖:** AC2

**Given** mock `/api/projects` 返回一个 active 项目  
**When** 打开 `/`  
**Then** 显示项目卡片和项目统计  
**And** 默认应用仍只出现一套  
**And** Welcome 无项目区域不出现

### TC3: Dock persisted/default merge 去重

**类型:** 单元测试  
**覆盖:** AC3

**Given** persisted state 中包含两个相同 `skillName` 的 app 和一个与 default app id 相同的 app  
**When** 调用 dockStore persist merge  
**Then** 输出 apps 中同一 `id` 和同一 `skillName` 均只保留一条  
**And** 缺失的 default pinned app 被补齐一次

### TC4: AppCard pin 不重复添加

**类型:** 组件测试  
**覆盖:** AC3

**Given** Dock store 已存在当前 AppCard 对应 app  
**When** 用户重复点击 pin 按钮  
**Then** `apps` 长度不增加  
**And** Electron `syncDockApps` 接收到的列表不含重复项

### TC5: display-content 默认不展示 thinking-only block

**类型:** 单元测试  
**覆盖:** AC4, AC5

**Given** assistant content 只有 `{ type: 'thinking', thinking: 'internal note' }`  
**When** 调用默认展示提取函数  
**Then** 返回空字符串或无可见内容  
**And** 仅在显式 `allowThinkingFallback: true` 时才允许调试路径返回 thinking

### TC6: provider thinking 标签剥离

**类型:** 单元测试  
**覆盖:** AC4, AC5

**Given** 文本包含 `<think>internal reasoning</think>\nfinal answer`  
**When** 调用展示 sanitizer  
**Then** 返回 `final answer`  
**And** 不包含 `internal reasoning`、`<think>` 或 `</think>`

### TC7: Session SSE 不发送 thinking payload

**类型:** API 集成测试  
**覆盖:** AC4

**Given** mock Pi Agent 依次发出 `thinking_delta`、`thinking_end`、`message_update text_delta`  
**When** 调用 `/api/agent/sessions/{sessionId}/messages`  
**Then** SSE 中没有 `thinking` 字段  
**And** 没有 `turn_start` / `turn_end` 用户消息  
**And** 包含最终 text delta 或 assistant message

### TC8: Project Agent SSE 不发送 thinking payload

**类型:** API 集成测试  
**覆盖:** AC4, AC6

**Given** mock project Agent 发出 thinking 和最终文本  
**When** 调用 `/api/agent/projects/{projectId}/messages`  
**Then** SSE 可见 payload 与 session route 策略一致  
**And** 不包含 thinking 内容

### TC9: 历史消息渲染过滤

**类型:** 组件测试  
**覆盖:** AC5, AC6

**Given** 历史 assistant message 包含 `metadata.thinking.content = "secret"` 且 `content = "final"`  
**When** 渲染 SkillDialog 或 AgentDialogContent 的消息列表  
**Then** 页面显示 `final`  
**And** 页面不显示 `secret`

### TC10: 多窗体一致性 smoke

**类型:** Playwright E2E  
**覆盖:** AC6

**Given** 用户打开内置 skill、用户 Agent、RoleAgent、项目访谈窗口  
**When** mock Agent 返回 thinking 和最终文本  
**Then** 每个窗体都只显示最终文本  
**And** 不显示 `thinking_delta`、`turn_start`、`turn_end` 或内部 reasoning 文本

---

## 验证命令

实施完成后至少运行：

```bash
pnpm lint
pnpm --filter @originos/core test -- display-content
pnpm --filter @originos/web test -- dockStore
pnpm --filter @originos/web test -- home-page
```

如果项目当前没有对应测试脚本，实施者必须补充等价 Vitest 或 Playwright 测试，并在本文件记录实际命令。

---

## 人工验收

1. 清空或 mock 项目列表，打开首页。
2. 确认默认应用卡片不重复。
3. 刷新页面，确认 Dock 和应用区不重复。
4. 打开至少一个 SkillDialog 和一个 AgentDialog。
5. 让 Agent 返回包含 thinking 的 mock 响应或使用测试 provider。
6. 确认窗体中只看到最终回答。

---

## 剩余风险

- 如果第三方 provider 把 reasoning 混入普通 text delta，sanitizer 需要覆盖更多标签格式。
- 如果旧历史消息把 thinking 拼进 `content` 而不是 metadata，只能通过文本规则剥离常见格式，不能恢复真实最终内容。
