# 架构设计文档 - Story M.13

**Story:** 旧记忆机制清退  
**版本:** 1.0  
**最后更新:** 2026-09-10

## 目标架构

```text
RoleAgent / ProjectAgent / PersistentAgent / Collaboration Agent
                         ↓
                  CognitiveManager
                         ↓
                   MemoryProvider
                         ↓
                     MemoryCore
              ┌──────────┼──────────┐
            Core       Recall      Archival
```

唯一长期整理入口为 `MemoryConsolidator`。Launcher 只负责组装上下文和启动会话，不再拥有记忆计数器、Writer 或 Dream 生命周期。

## 删除范围

- `lib/integrations/pi-agent/role-agent/dream.ts`
- `modules/memory-core/core/dream-compat.ts`
- `modules/memory-core/adapter.ts`
- RoleAgent Launcher 中的 `MemoryTracker` session state 与调用
- `RecallMemory` 中只为 Dream 提供的 cursor API
- 上述实现的公共导出与专属测试

`role-agent/memory-tracker.ts` 在解析能力迁出后整体删除；若仍有外部兼容需要，则仅保留带移除期限的 re-export，不得含存储或生命周期逻辑。

## 保留范围

- `HistoryStore.migrateLegacyFile()`：只负责已有 `memory/history.jsonl` 的安全迁移。
- `Memory.md`、blocks、recall、archival、cognition 数据格式。
- MemoryCore 的 5-turn reflect 门槛和明确偏好零 LLM 路径。

## 依赖约束

- Launcher 和 ProjectContext 只能依赖 MemoryCore 公共 API。
- MemoryCore 不依赖 RoleAgent、ProjectAgent、Web 或 Desktop。
- 不创建新的 Adapter、Manager 或 feature flag。

## 数据安全

- 不主动删除用户目录中的 `.dream_cursor` 或旧历史文件。
- 旧历史迁移使用同文件系统 rename；目标存在时保持源文件不变。
- 新运行时不得再写旧格式。

