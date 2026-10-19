# 测试文档 - Story P2.9

| ID | 场景 | 预期 |
|---|---|---|
| P29-U1 | 自动验收保存 | 节点无 after-verification HITL |
| P29-U2 | 用户确认保存 | 生成 user approver HITL |
| P29-U3 | 指定角色确认 | 保存稳定角色 ID |
| P29-U4 | 指定角色为空 | 保存和发布均被拒绝 |
| P29-U5 | 修改 confirmed/published 版本 | 拒绝并提示创建新版本 |
| P29-I1 | verifier 通过 + 自动验收 | completed 并推进下游 |
| P29-I2 | verifier 通过 + 用户确认 | waiting_hitl，下游不启动 |
| P29-I3 | 用户退回 | revision，保留审核记录 |
| P29-C1 | 设计 UI 切换策略 | 保存后重读一致 |
| P29-C2 | 看板状态 | 验证、确认、修订、阻塞分别显示 |

## 2026-10-15 验收证据

- Core solution、contract runtime 与看板投影：12 个测试文件共 65 项通过；其中 P2.9 定向 QA 集合 4 个文件 28 项通过。
- Web 验收配置、双通道 client、API route 与统一任务看板：4 个文件 13 项通过。
- `pnpm --filter @originos/desktop exec tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint:boundaries`：通过，扫描 1003 个生产文件，0 条诊断。
- `node scripts/check-architecture-boundaries.cjs --self-test`：通过，51 个导入用例在两种 CWD 下通过。
- `node scripts/expand-core-exports.cjs --verify`：通过，121 个消费说明符、136 个显式导出、0 个通配。
- `openspec validate add-solution-output-acceptance --strict`：通过。
- `desktop:dev` HTTP 冒烟：已确认方案可读取 17 个节点与中文名称并返回只读状态；PATCH 返回 `SOLUTION_LOCKED`，不会改写已确认版本。
- 旧方案兼容：自定义 legacy HITL trigger 可读取且保存时原样保留；P2.9 仅管理 `after_verification`。

## 已知基线问题

- Core 全量 TypeScript 仍被 `ontology/legacy-migration.ts` 的既有 Zod 输出类型问题，以及 `pi-agent/client-hooks` 的 5 个既有相对导入错误阻断。
- Web 全量 TypeScript 同样受到上述 `client-hooks` 基线错误影响；P2.9 定向代码未产生新增 TypeScript 错误。
