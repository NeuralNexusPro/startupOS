# Story 1.7 验证计划

当前状态：核心、访谈同步与 Web 投影已实现并完成定向自动验证；未做独立手工 desktop:dev 交互录屏。OpenSpec 格式校验不等同功能通过。

## Verification goal

同一次访谈产生的角色、对象、活动等在图谱和列表中分类一致；仅补关系不产生占位概念；纠正分类不改变 ID；重启保持结果；旧项目未经确认零写入。

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

运行受影响测试与类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test，再执行 openspec validate refine-interview-semantic-modeling --strict。功能体验用 desktop:dev，不本地打包。

## 本次实际结果（2026-09-27）

- 核心与访谈同步定向测试：5 个文件、33/33 通过。
- Web 定向测试：2 个文件、3/3 通过；`pnpm --filter @originos/web type-check` 通过。
- `pnpm lint:boundaries`：962 个生产文件、0 条诊断；架构自测 43 × 2 通过。
- `pnpm lint`：0 errors、3103 warnings；warnings 是仓库存量，未作为本 Story 通过依据。
- `openspec validate refine-interview-semantic-modeling --strict` 与 `git diff --check`：通过。

未完成：未在独立测试项目手工完成旧数据“整理概念分类”确认流程和深浅色 desktop:dev 录屏；构建与发布不在本 Story 范围。
