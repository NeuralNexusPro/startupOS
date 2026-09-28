# 需求文档 - Story M.8

**Story:** 记忆链路收敛 — 围栏修复 + 新旧合并 + DataFile 对齐
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 的维护者，我需要把 memory-core 模块从「Planning 文档 + 已上线代码 + 旧链路并存」的混合状态收敛为单一权威实现，使所有 Agent 类型走同一记忆链路、文档与代码一致、模块围栏不再被反向 import 击穿。

---

## 问题

1. **模块围栏破损（ARCH-MC-01）**：4 处反向 import `@/lib/`：
   - `src/modules/memory-core/core/consolidator.ts:11` → `createAutoModel`
   - `src/modules/memory-core/adapter.ts:9` → `MemoryBlock` 类型
   - `src/modules/memory-core/session/memory-provider.ts:8` → `CognitiveProvider/TurnCognitiveData`
   - `src/modules/memory-core/session/enhanced-pattern-provider.ts:11` → 同上
2. **新旧链路双轨（ARCH-MC-03）**：role-agent launcher 走 `MemoryTracker` + `MemoryBlockManager`，project-agent / persistent-agent / 协作 Agent 走 `MemoryCore`；同 agent 目录切换链路会破坏 `Memory.md`。
3. **`MemoryAdapter` 名存实亡（ARCH-MC-05）**：完整旧 API 桥但 0 引用。
4. **Dream / Consolidator 双 LLM 入口（ARCH-MC-06）**：两份相似 prompt，触发条件不一，文档无说明。
5. **role-agent `consolidator.ts` 仍是 stub（ARCH-MC-07）**。
6. **`system_prompt_block` 与 Knowledge.md/Patterns.md 注入顺序未定义（ARCH-MC-08）**。
7. **`blocks.json` / `entries.jsonl` 不符合 AGENTS.md DataFile 规约（ARCH-MC-10）**。
8. **`any / as any` 滥用（ARCH-MC-11）**。
