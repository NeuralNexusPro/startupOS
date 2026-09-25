# 943-T3-C 验收证据

**日期：** 2026-09-25  
**范围：** Story 9.43 的 B09、B12；本证据不代表 B01–B14 全部完成。

## B09：执行徽标不改写 Task 状态

- Core `task-board.test.ts` 验证绑定 WorkItem 已完成时，Task 仍保持权威 `active` 状态，同时保留 Agent、WorkItem 与产物摘要。
- Web `ProjectTaskBoard.test.tsx` 验证 `runtimeStatus=completed` 的 active Task 仍位于“进行中任务列”，显示“执行完成”徽标，且不会出现在“已完成任务列”。
- 六个任务列增加 `region` 与可访问名称，使键盘和自动化测试均能按业务状态准确定位。

## B12：1000 条任务按 cursor 分页

- Core `project-task-source.test.ts` 使用 1000 条同项目持久 Task fixture，断言请求上限即使为 100 也只返回 50 条；第二个 cursor 页仍为 50 条；两页读取及索引重建必须小于 500ms。该测试本次运行文件总耗时为 17ms。
- Web 组件测试使用 1000 条 fixture，但服务每次只返回 50 条。首屏只渲染 50 张卡片；携带 `cursor=page-2`、`limit=50` 后累计 100 张，第三页任务不会提前进入 DOM。

## 自动化结果

| 检查 | 结果 |
|---|---|
| Core source/board 定向测试 | 2 files / 12 tests passed |
| Web service/component 定向测试 | 2 files / 13 tests passed |
| Core typecheck | passed |
| Web typecheck | passed |
| Desktop typecheck | passed |
| Web 全量 lint | passed，0 errors；仓库存量 3140 warnings |
| T3 相关文件 ESLint | passed，0 errors；36 warnings |
| `pnpm lint:boundaries` | 919 production files，0 diagnostics |
| 架构检查器 self-test | 43 import cases × 2 CWD passed |
| `git diff --check` | passed |
| OpenSpec strict validation | passed |

隔离克隆首次复用主工作区 `node_modules` 时，Web typecheck 因两份绝对路径不同的 `@originos/core` 私有类型产生身份冲突。改为隔离工作区自己的 pnpm 链接后同一命令通过；该环境问题不计为产品缺陷。

## 未覆盖项

B01–B08、B10–B11、B13–B14 仍由 Story 9.43 的其他 Task 和 ONT.8 联合验收负责。本 Task 不关闭 Story 9.43。
