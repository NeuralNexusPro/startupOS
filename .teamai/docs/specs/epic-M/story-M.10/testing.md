# 测试文档 - Story M.10

**Story:** Memory Core 文档与协作场景对齐
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

1. `docs/specs/epic-M/README.md` 与每个 story README 状态准确反映 `src/modules/memory-core/` 现状；新增「实施进度」列。
2. `docs/design/memory-core.md` 含「实施进度对照表」「术语表」「多 Agent 协作场景的记忆策略」三个新增章节。
3. CLAUDE.md v2.4.0 §数据存储规约第 7 节包含 archival / memory/history / blocks.json 三类路径。
4. `docs/design/multi-agent-runtime.md` §3 含指向 memory-core §9 的交叉引用。
5. `docs/changes/changelog.md` 包含 memory-core 模块上线追溯条目。
6. 用术语表统一后，全文不再出现「Long-term Memory」「Short-term Memory」「语义向量存储」「对话历史索引」等漂移用词（除术语表本身外）。
7. 进入 Story M.7 之前，本 Story 与 M.8 / M.9 必须 Resolved。
