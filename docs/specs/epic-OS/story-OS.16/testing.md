# Story OS.16 Test Plan: 系统级定时任务与定时唤起能力

**Story:** OS.16
**状态:** 📋 Planning
**测试范围:** Schedule Service、定时唤起执行器、Agent / Skill / system action 集成、桌面 UI 管理入口

---

## 测试目标

- 验证一次性、固定间隔和 cron 触发器能正确计算 `nextRunAt`。
- 验证应用重启、睡眠唤醒、系统时间变化后，任务不会丢失或重复执行。
- 验证定时唤起 Agent / Skill / system action 时继承正确权限和工作目录边界。
- 验证 UI 能创建、查看、暂停、恢复、删除和立即运行任务。
- 验证失败场景能清晰写入 run log 并反馈到 UI。

---

## 单元测试

| 用例 | 场景 | 预期 |
|------|------|------|
| UT-01 | 创建 once trigger，时间在未来 | 正确返回该时间作为 `nextRunAt` |
| UT-02 | once trigger 时间已过去 | 返回校验错误或按 missed run 策略处理 |
| UT-03 | interval trigger 设置 `everyMs` | 按间隔计算下一次触发时间 |
| UT-04 | cron trigger 使用合法表达式 | 正确计算下一次触发时间 |
| UT-05 | cron trigger 使用非法表达式 | 返回可展示的校验错误 |
| UT-06 | 暂停任务 | 不再进入待执行队列 |
| UT-07 | 恢复任务 | 重新计算下一次触发时间 |
| UT-08 | 同一触发点重复调度 | 只生成一次 run record |

---

## 集成测试

| 用例 | 场景 | 预期 |
|------|------|------|
| IT-01 | Schedule Store 保存任务 | `data/schedules/tasks.json` 符合数据格式约束 |
| IT-02 | 应用重启后加载任务 | enabled 任务恢复调度 |
| IT-03 | 到期唤起 Agent | Agent 会话创建成功，prompt 包含定时任务上下文 |
| IT-04 | 到期唤起 Project Agent | `workingDirectory` 使用项目 `currentPath` |
| IT-05 | 到期唤起 Skill | 产物不写入 `.claude/skills/` |
| IT-06 | 到期执行 system notify | 通知事件发出，run log 标记成功 |
| IT-07 | Agent / Skill 不存在 | run log 标记失败，UI 显示错误摘要 |
| IT-08 | 睡眠唤醒后补偿 missed run | 按策略执行或跳过，不重复执行 |

---

## E2E 测试

| 用例 | 场景 | 预期 |
|------|------|------|
| E2E-01 | 从设置页创建一次性提醒 | 到期后显示通知或打开指定窗口 |
| E2E-02 | 创建周期性 Agent 任务 | 列表展示下一次运行时间，触发后更新 |
| E2E-03 | 暂停任务 | 状态变为 paused，等待窗口内不触发 |
| E2E-04 | 恢复任务 | 状态变为 enabled，并重新显示下一次运行时间 |
| E2E-05 | 删除任务 | 列表移除，后续不再触发 |
| E2E-06 | 手动立即运行 | 不等待下一次时间，立即生成 run log |
| E2E-07 | 点击带行动的系统通知 | 直接调用既有通知行动接口并关闭通知面板，不先展开详情 |
| E2E-08 | 点击无行动的系统通知 | 在通知面板内展开完整标题、正文、类型、状态和准确时间，再次点击可折叠 |
| E2E-09 | 长通知出现在右上角系统栏 | 列表摘要保持紧凑且不丢失详情入口，展开后正文不截断 |

## 通知详情组件测试

- 带 `activationTarget` 或兼容 `payload.action` 的通知显示“立即处理”，Enter/Space/点击均只派发一次 `originos:notification-activate`。
- 无行动通知显示“查看详情”，点击后标记已读并渲染完整正文；再次点击折叠，不派发行动事件。
- 关闭按钮不触发行动或详情切换；展开态使用 `aria-expanded`、关联详情区域和可见焦点。

---

## 手工验证

- macOS 桌面端睡眠 1-3 分钟后唤醒，确认到期任务处理策略符合预期。
- 修改系统时区后打开应用，确认任务列表的下一次运行时间重新计算。
- 关闭系统通知权限后触发 system notify，确认应用不崩溃且 UI 显示失败原因。
- 在网络不可用时执行需要外部能力的 Agent / Skill 任务，确认失败被记录且不影响后续任务。

---

## 回归范围

- OS.7 Agent 托管服务：定时唤起不应破坏手动 Dock 启动 Agent。
- OS.9 应用窗口系统：定时打开窗口不应破坏现有窗口 z-index 和关闭逻辑。
- OS.14 工作目录边界：定时执行不应向工具层注入输出目录语义。
- Skill 运行目录：系统内置技能仍不得向 `.claude/skills/` 写入产物。

## 2026-09-04 通知详情与行动验证

- 通知面板与右上角即时通知：无行动点击展开完整详情；有行动直接调用既有激活接口；关闭按钮不触发行动。
- Web 通知组件与 Electron 通知 IPC 共 8 个测试通过。
- Web TypeScript 通过；相关 ESLint 0 error（保留仓库既有 warning）。
