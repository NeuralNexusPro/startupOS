# P2.6 验证记录

日期：2026-09-27。Task：P26-T1；分支 proposal-task/complete-sop-contract-authoring-t1-core。

## 确定性回归

`pnpm --filter @originos/core exec vitest run src/lib/features/project/__tests__/sop-contract-authoring.integration.test.ts src/lib/features/project/__tests__/solution-design-source.test.ts src/lib/features/solution/__tests__/execution-contract.test.ts src/lib/features/ontology/__tests__/contract-validator.test.ts src/lib/features/skills/__tests__/service.test.ts src/lib/integrations/pi-agent/__tests__/skills.test.ts`

结果：6 文件、57 测试通过。

新增 integration 13 例：
- 直接读取模板目录 ontology.json 与版本化三文件；真实技能 loader 读取创建产物，再执行 publish/read 验证 contract 一致。
- legacy、missing-ref、broken-flow、version、cycle、missing-policy 分别断言精确错误码、未发布与源文件字节不变。
- 嵌套 YAML canonical 与旧元数据无损保留，不泄漏缩进键为顶层。
- malformed scalar、缺字段、重复键、未知 alias 返回诊断，不加载伪类型契约。
- 示例采用 SKILL.example.txt，扫描时不暴露为真实 bundled Skill。

## 类型、架构与运行依赖

- `pnpm --filter @originos/core exec tsc --noEmit --incremental false --composite false`：通过。
- `pnpm lint`：0 errors，3215 个已有 warnings；未自动修历史。
- `pnpm lint:boundaries`：944 生产文件，0 诊断。
- `node scripts/check-architecture-boundaries.cjs --self-test`：43 例 × 2 CWD 通过。
- `pnpm --filter @originos/pi-agent-adapter build`：小型 runtime bundle 成功。
- yaml 2.9.0 已存在锁文件，声明为 root/core/desktop 直接运行依赖。worktree 通过指向既存包的链接验证 dist-electron 与 desktop createRequire 解析及嵌套 YAML 解析成功；没有修改主仓 node_modules。集成环境须按更新 lock 安装，未运行完整 app 打包验证。

## 边界

未运行 build:app、standalone、发布或远端推送。此记录证明确定性模板样本/发布门控，不承诺 LLM 每次生成合法方案。Task 实施完成，最终 Story 状态由父代理集成审查确定。

## 主仓集成验收

2026-09-27：Task → Proposal → 本地 `0.4.x` 串行集成；6 文件、57 测试通过。主仓 Web 严格全量类型检查通过，P2.6 的 7 处严格类型问题已修正。Core 全量类型检查通过。最终 lint、架构扫描、自测与 OpenSpec strict 校验通过。

本轮未进行打包、远端推送或人工桌面体验验收；原有 standalone 打包修复现场保持不变。
