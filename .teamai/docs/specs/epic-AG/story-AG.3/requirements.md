# 需求文档 - Story AG.3

**Story:** `src/lib/*` 业务目录回归 `features/` + 循环依赖拆解
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 用户故事

> 作为 OriginOS 维护者，我需要让 `src/lib/` 顶层目录回归 CLAUDE.md §目录规则 #3 与 §依赖层级定义中的设定 — 业务功能必须在 `lib/features/` 下，且 feature 之间通过 `index.ts` 单向依赖。当前散落在 `lib/` 下的 11 个非 features 业务目录，以及 `features/agent ↔ skills/project-initialization` 的循环依赖必须被消除。

---

## 当前现状（基线）

```
src/lib/
├── agents/                          # 业务（旧 ProjectAgent，与 integrations/pi-agent/project-agent 重复）
├── animations/                      # 工具/资源
├── api/                             # 业务客户端封装
├── collaboration-runtime-service/   # AG.1 已处理（删除或保留薄壳）
├── features/                        # ✅ 合规
│   ├── agent/
│   ├── culture/
│   ├── interview/
│   └── ontology-data-store/
├── hooks/                           # ✅ 合规
├── integrations/                    # ✅ 合规
├── interview/                       # 业务（与 features/interview 重叠）
├── ontology/                        # 业务
├── project/                         # 业务
├── sandbox/                         # 业务
├── skills/                          # 业务（含 registry/executor/decision/project-initialization）
├── storage/                         # ✅ 合规
├── system/                          # 业务
├── taste/                           # 业务（与 Epic T 关联）
└── utils.ts                         # ✅ 合规
```

---

## 目标终态

```
src/lib/
├── shared/                         # ✅ 由 AG.2 引入
├── features/
│   ├── agent/                       # 合并旧 lib/agents/ 与 lib/features/agent
│   ├── culture/                     # 既有
│   ├── interview/                   # 合并旧 lib/interview/
│   ├── ontology/                    # 合并旧 lib/ontology + ontology-data-store
│   ├── project/                     # 旧 lib/project
│   ├── sandbox/                     # 旧 lib/sandbox（如仍有业务，否则迁 modules/）
│   ├── skills/                      # 旧 lib/skills
│   ├── system/                      # 旧 lib/system
│   ├── taste/                       # 旧 lib/taste
│   └── api-clients/                 # 旧 lib/api（更名以避免与 src/app/api 概念混淆）
├── hooks/
├── integrations/
├── storage/
├── utils.ts
└── animations/                      # 视情况：若仅是动画 token / 配置 → 留 lib/animations 作为基础设施；否则迁 features/animations
```

---

## 验收标准

1. - [ ] `src/lib/` 顶层目录仅剩：`features/ integrations/ storage/ utils/ hooks/ shared/`（外加可选 `animations/`），其他业务子目录全部迁出
2. - [ ] `npx madge --circular src/` 输出 `No circular dependency found`
3. - [ ] `grep -rn "@/lib/agents\|@/lib/skills/[^i]\|@/lib/interview\|@/lib/ontology\|@/lib/project\|@/lib/sandbox\|@/lib/system\|@/lib/taste\|@/lib/api/" src/` 不返回旧路径引用
4. - [ ] `features/agent/index.ts` 不再 re-export `@/lib/skills/*` 或 `@/lib/features/skills/*` 内部模块
5. - [ ] `skills/project-initialization` 不再 import `@/lib/features/agent`
6. - [ ] `npx tsc --noEmit` 0 error
7. - [ ] `npm test` 通过（保持基线）
8. - [ ] 协作运行时 4 项核心 e2e 通过
9. - [ ] 每个迁移子目录有独立 PR；commit 使用 `git mv` 保留历史
10. - [ ] CLAUDE.md 目录结构示例图（§目录结构规约）若引用旧路径，由 AG.4 同步更新

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| 多 PR 串行 / 并行时 import 路径替换冲突 | 每个 PR 自带 `grep` 验证；冲突由后入 PR 负责 rebase 时跑全量替换 |
| Epic T 的 taste 迁移与 Epic T 进行中 Story 冲突 | B-8 在执行前 ping Epic T 负责人；可推迟到 Epic T 当前 Sprint 结束后 |
| `lib/agents/project-agent.ts` 被某些遗留 API 路由引用 | 删除前 grep `ProjectAgent`，逐一改造 import 到 `lib/integrations/pi-agent/project-agent` |
| 循环依赖拆分时打破现有 React Hook 依赖链 | 每次 A-1 类改动跑一次端到端会话冒烟；保留 hook 接口签名不变 |
| 物理移动后 git blame 历史断 | 强制使用 `git mv`；CI 检查 PR diff 不应有大量 "delete + add" 而是 "rename" |

---

## 相关文档

- [Epic AG README — 决策点 #2](../README.md)（增量迁移 vs 一次性大迁移）
- [CLAUDE.md §目录规则 #3 / §依赖规则 #4](../../../../CLAUDE.md)
- [Epic T README](../../epic-T/README.md)（taste 子目录迁移协调）
