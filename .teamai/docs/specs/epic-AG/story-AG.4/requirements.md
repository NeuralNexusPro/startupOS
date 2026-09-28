# 需求文档 - Story AG.4

**Story:** 组件分层条款修订（CLAUDE.md 与现实对齐）
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-07-17

---

## 用户故事

> 作为 OriginOS 维护者，我需要 CLAUDE.md 的「组件分层」条款与项目实际组件组织方式一致。当前 CLAUDE.md 写明「atoms / molecules / organisms」分层，但 `src/components/atoms/` 不存在，`molecules/` 仅 2 文件，`organisms/` 仅 1 文件且为死代码候选 — 现实是按业务域分组（os/skills/solution/...）。规约必须修订到与现实一致且能被持续执行的版本。

---

## 决策说明

### 默认假设：方案 A — 合法化按业务域分组

> Epic AG README 中的决策点 #1 默认采用本方案；如需 fallback 到 ALT-A（坚持 atoms/molecules/organisms），整体范围与新增条款相反，由 Story 级单独评估。

**方案 A 要点：**

- **取消** 强制要求 atoms / molecules / organisms 三段式分层
- **新增** 按业务域分组规则：
  - `src/components/ui/`：基础 UI（shadcn 风格 / 通用 token），不绑定业务
  - `src/components/{domain}/`：按业务域分组（如 `os/ skills/ solution/ project/ sandbox/ taste/ window/ interview/ framework/`）
  - 业务域组件可依赖 `ui/` + `lib/features/` + `lib/shared/`
  - 业务域之间的共享组件 → 抽到 `ui/` 或新增 `components/shared/`（仅在出现真实复用需求时）
- **保留** `molecules/`（如确实是跨域共享） — 但仅作为兼容路径，不再要求新组件入此目录
- **删除** `components/organisms/`（若 AG.1 确认 `CommandInterface.tsx` 死代码已删）

---

## 验收标准

1. - [ ] CLAUDE.md §目录结构规约 中的 `src/components/` 子树与现实一致
2. - [ ] CLAUDE.md §UI/UX 规约 不再强制要求 atoms/molecules/organisms 三段式
3. - [ ] CLAUDE.md §依赖层级定义 含 Layer 0 `lib/shared/`
4. - [ ] CLAUDE.md §模块依赖规约 含模块 UI 豁免与 ui-deps 注入条款
5. - [ ] CLAUDE.md 版本号更新为 v2.5.0；「最后更新」日期更新
6. - [ ] `docs/changes/changelog.md` 追加变更记录（docs 类型）
7. - [ ] CLAUDE.md 修订后跑全文搜索 `atoms\|molecules\|organisms`，命中位置全部为「兼容路径说明」或不再命中
8. - [ ] AG.1 / AG.2 / AG.3 涉及的目录结构变化在 CLAUDE.md §目录结构规约中已同步

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| 文档修订与 Epic 9 / Epic C 进行中 Story 表述冲突 | A-1 ~ A-5 修订前 ping 各 Epic 负责人；只增不删的条款优先合入 |
| 删除 atoms/molecules/organisms 后老文档与新规约不一致 | 在 changelog 明确说明「现状即合规」，并在新规约段落保留「兼容路径说明」 |
| 用户希望坚持 atoms/molecules/organisms（fallback ALT-A） | 本 Story 范围反转为：补齐 `atoms/`、按粒度拆分现有按域分组的组件、按层级建立依赖规则；工时升至 3–4 天，单独评估 |

---

## 相关文档

- [Epic AG README — 决策点 #1](../README.md)
- [CLAUDE.md（v2.4.0，待修订为 v2.5.0）](../../../../CLAUDE.md)
- [Story AG.2 — shared 层引入](../story-AG.2/README.md)
- [Story AG.3 — `src/lib/*` 迁移目标终态](../story-AG.3/README.md)
