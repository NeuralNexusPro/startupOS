# 测试策略 - Story 9.38

**Story:** Service/Bridge 层合并 — 协作模块边界收敛
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 测试策略

### 迁移验证

- [ ] 迁移现有 `collaboration-runtime-bridge/__tests__/` 到 `modules/collaboration-runtime/engine/__tests__/`
- [ ] 迁移现有 service 层逻辑测试（如有）
- [ ] `npm run lint` 0 error
- [ ] `npm run typecheck` 0 error
- [ ] 现有 API route 测试通过（`sessions/[id]/messages/__tests__/`、`human-review/__tests__/`）

---

## 验收标准测试

- [ ] `src/lib/collaboration-runtime-service/` 目录不存在
- [ ] `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` 不存在
- [ ] `src/lib/collaboration-runtime-bridge/project-context-writer.ts` 不存在
- [ ] 所有 API Routes import 路径指向 `@/modules/collaboration-runtime/facade`
- [ ] `npm run typecheck` 0 error（排除预存错误）
- [ ] `npm run lint` 0 error
- [ ] 现有测试全部通过
