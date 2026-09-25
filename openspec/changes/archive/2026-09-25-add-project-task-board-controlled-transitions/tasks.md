# Tasks

## 1. Core 转换边界

- [x] 1.1 `943-T5-A`（串行；依赖：9.42 阶段机与 943-T3；角色：Core project subagent；写入：task board/source、Task Runtime review port 与测试）实现 targetStatus→公开 capability 解析、requestId/revision/lease CAS 和结构化拒绝；无唯一命令时零写入。
- [x] 1.2 `943-T5-B`（串行；依赖：1.1；角色：Task evidence subagent；写入：公开 review/completion port 与测试）实现 request review/approve/reject，完成前验证 Step/Criterion Evidence 与 unresolved Blocker；验证 WorkItem 完成不替代 Task Evidence Gate。

## 2. Transport 与交互

- [x] 2.1 `943-T5-C`（串行；依赖：1.2；角色：Transport subagent；写入：cross-package/Desktop/Web service 与测试）传递 transition intent 和稳定错误/缺口，不在 adapter 推断状态。
- [x] 2.2 `943-T5-D`（串行；依赖：2.1；角色：Web interaction subagent；写入：task board UI 与组件测试）实现拖拽与键盘移动菜单共用 handler、处理中不移列、拒绝焦点恢复/aria-live/草稿保留。

## 3. 验收

- [x] 3.1 `943-T5-E`（串行；依赖：2.2；角色：Integration QA subagent；写入：evidence/Story）执行 B04、B05、B06、B10，运行三包 typecheck、lint、边界、自测、diff check 和 strict validation。
