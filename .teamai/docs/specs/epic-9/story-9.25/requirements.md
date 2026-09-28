# 需求文档 - Story 9.25

**Story:** 子进程复用机制（Agent Pool）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为系统，我需要按 agent 复用 key 共享子进程，避免每次 session 都启动独立进程导致资源浪费，同一复用 key 的多个 session 共享一个子进程（顺序执行）。

---

## 问题

当前每个 agent session 都 spawn 独立子进程，导致：
- **33+ 僵尸进程残留** — 每次关闭 dev server 后遗留
- **冷启动延迟 ~2s** — `npx tsx` 启动 + TypeScript 编译 + 加载模型 + 创建 Agent
- **内存浪费** — 每个进程独立加载模型配置、Agent 实例

---

## 功能需求

### 复用 key 计算规则

| 来源 | 复用 key 格式 | 示例 |
|------|-------------|------|
| **Project (Persistent Agent)** | `project:{projectId}` | `project:abc-123` |
| **Agent / RoleAgent** | `agent:{agentCode}` | `agent:business-interviewer` |
| **Skill** | `skill:{skillCode}` | `skill:ontology-builder` |
| **回退** | `session:{sessionId}` | `session:uuid-xxx` |

调用方在 `createSession` 时传入 `reuseKey` 字段。

### 复用逻辑

- **同一 reuseKey 首次创建 session** → spawn 新子进程
- **同一 reuseKey 后续 session** → 复用已有子进程，消息顺序排队执行
- **引用计数管理** → `refCount` 跟踪几个 session 在使用，归零后不立即关闭
- **空闲超时回收** → 超过 5 分钟无引用的空闲进程自动释放
- **systemPrompt 热更新** → 后续 session 可通过 `setSystemPrompt` 更新子进程中的配置

---

## 验收标准

- [ ] 同一 reuseKey 的多个 session 共享一个子进程
- [ ] `ps aux | grep agent-worker` 验证进程数 = 不同 reuseKey 的数量
- [ ] 引用计数正确增减
- [ ] 空闲超时后自动清理子进程
- [ ] setSystemPrompt 热更新后下次 prompt 使用新配置
- [ ] `npx tsc --noEmit --skipLibCheck` 零 TS 错误
- [ ] 子进程测试覆盖复用逻辑

---

## 依赖关系

- 9.6（PI Agent 桥接与子进程入口）
