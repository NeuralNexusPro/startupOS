# 需求定义 - Story 9.10

**Story:** Node.js 沙箱（MVP）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为系统，我需要通过沙箱隔离每个 Agent 子进程的执行环境，这样失控或恶意的 Agent 不会影响系统安全和其他 Agent。

---

## 功能需求

1. **沙箱启动** — 通过 `@anthropic-ai/sandbox-runtime` 包装 Agent 子进程
2. **文件系统权限** — allow-write（默认拒绝），deny-write 保护敏感路径
3. **超时控制** — AbortSignal，超时 kill 子进程
4. **违规追踪** — SandboxViolationStore 记录所有越权行为
5. **per-Agent 配置** — 每个 Agent 独立的沙箱权限

## 边界条件

- 子进程无法写入 deny-write 路径
- 超时后子进程被 kill
- 违规事件可查询
- 每个 Agent 独立沙箱配置
- sandbox 清理后无残留进程

## 验收标准

- [ ] 子进程无法写入 deny-write 路径
- [ ] 超时后子进程被 kill
- [ ] 违规事件可查询
- [ ] 每个 Agent 独立沙箱配置
- [ ] sandbox 清理后无残留进程

## 依赖关系

- [设计文档 §6 沙箱层](../../design/multi-agent-runtime.md#6-sandbox-层)
- [@anthropic-ai/sandbox-runtime](../../../learn/sandbox-runtime/)
