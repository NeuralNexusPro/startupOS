# Story 1.8 验证计划

当前状态：核心与 Web 集成测试已执行并通过；`desktop:dev` 的人工交互体验尚待发布线合入后执行。OpenSpec 格式校验不等同于产品体验验收。

## Verification goal

访谈行为可持续补充草稿，用户确认后原子发布完整定义；冲突和崩溃无半套契约；重试唯一；未支持的规则仍不能执行；P2 使用准确引用。

## 用例与证据

| 层级 | 用例 | 预期证据 |
|---|---|---|
| 单元 | requirements.md 全部 AC，枚举/引用/权限非法值 | 字段级 issue 与未写入断言 |
| 集成 | Web API 与 Desktop IPC 同一 DTO 往返 | 分类/来源/定义无丢失 |
| 持久化 | 相同 operationId 重试、陈旧 revision、重启 | 唯一回执、不覆盖新数据 |
| 故障 | canonical 已提交、派生状态失败 | 按回执恢复，不重复修改 |
| UI | 空态、加载、错误、深浅色、键盘、窄窗口 | desktop:dev 操作记录 |
| 性能 | 50 与 200 节点，查询与投影延时 | 时延数据及虚拟化/裁剪证据 |
| 安全 | 无权限、跨项目来源、旧确认复用 | 拒绝且事实文件保持不变 |

1.7 专项：缺字段旧快照读取字节不变；分类确认前无写入；用户分类不被自动覆盖；仅关系输入成功；重复名称返回歧义；未知端点显式失败；部分接纳逐项可见。

1.8 专项：合法批次成功；任一引用非法全量拒绝；100条边界/101条拒绝；双进程同 revision 至多成功一次；快照写入后回执失败恢复；草稿确认 hash 不匹配拒绝；有 Rule 无 evaluator 拒绝且不写运行 facts。

## 数据与执行

使用独立临时 fixture 项目，包含 SQE、供应商、来料批次、来料检验、8D 报告、验收规范和待分类概念；模拟旧快照与非法交叉引用。不得使用或改写用户真实项目验证。

运行受影响测试与类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test，再执行 openspec validate author-interview-behavior-contracts --strict。功能体验用 desktop:dev，不本地打包。实际命令、结果、耗时与未验证平台在实施后补录。

## 2026-09-28 集成证据

- `pnpm --filter @originos/core exec vitest run --config vitest.config.ts src/lib/features/ontology/__tests__/authoring-transport.test.ts src/lib/features/ontology/__tests__/authoring-service.test.ts src/lib/features/ontology/__tests__/validator.test.ts src/lib/features/project/__tests__/interview-behavior-draft-service.test.ts`：补充可信确认入口后为 4 文件、34 项通过。
- `pnpm --filter @originos/web exec vitest run src/components/os/workspace/project-canonical-ontology.test.ts`：2 项通过。
- `pnpm --filter @originos/core exec tsc --noEmit` 与 `pnpm --filter @originos/web type-check`：通过。
- `pnpm lint`：0 error，3126 条既有 warning；`pnpm lint:boundaries`：补充入口后为 966 个生产文件、0 诊断；`node scripts/check-architecture-boundaries.cjs --self-test`：43 个用例在两种工作目录下通过。
- `openspec validate author-interview-behavior-contracts --strict`：通过；`git diff --check`：通过。
- 人工 `desktop:dev` 体验、窄窗口键盘操作和 50/200 节点性能数据尚未执行，未据此宣称通过。
