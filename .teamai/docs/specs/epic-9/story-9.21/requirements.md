# 需求文档 - Story 9.21

**Story:** Agent Pool 预热机制
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为协作运行时，我需要维护一个预热的 Agent 实例池，这样当新任务到来时可以立即获取已初始化的 Agent（<100ms），跳过冷启动开销（读取 Agent.md/Tool.md/Skill.md、构建 prompt、初始化 sandbox 约 ~2s）。

---

## 功能需求

1. **预热池** — 启动时按配置预创建 Agent 实例，保持空闲待机（prompt 已构建，sandbox 已初始化）
2. **按需获取** — `get(agentType)` 命中则返回预热实例（<100ms），miss 则新建（~2s）
3. **TTL 管理** — 预热实例记录 `lastUsedAt`，超过 `ttlMs`（默认 5 分钟）未使用则淘汰释放
4. **容量控制** — `minPoolSize`（至少保持 N 个空闲实例）/ `maxPoolSize`（上限，超过则等待）
5. **健康检查** — 每 30s ping 池中实例，异常（无响应/内存超标）立即淘汰并补充
6. **类型隔离** — 按 Agent 类型维护独立子池（coder-pool、architect-pool），避免类型不匹配
7. **Metrics 暴露** — 命中率、平均获取延迟、池大小变化曲线

---

## 验收标准

- [ ] 预热 Agent 实例获取延迟 < 100ms（vs 冷启动 ~2s）
- [ ] TTL 超时后实例被淘汰，新请求触发预热
- [ ] 池满时新请求等待（不创建超出 maxPoolSize 的实例）
- [ ] 池空时新建实例（不超过 maxPoolSize 限制）
- [ ] 健康检查淘汰异常实例并补充
- [ ] 按类型隔离，不会返回错误类型的 Agent
- [ ] Metrics 正确记录命中率、延迟、池大小

---

## 依赖关系

- Story 9.6: PI Agent 桥接与子进程入口
- Story 9.10: Node.js 沙箱
