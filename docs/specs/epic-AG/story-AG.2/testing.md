# 测试策略 - Story AG.2

**任务:** AG2-T1；**最后更新:** 2026-09-11
**状态:** 用例已定义，实施与验证待批准。

## 基线与执行约束

基线 dev b2d6bdb，34 处违规清单见 AG.5/lint-baseline.md。所有持久化测试使用临时数据根；不修改真实用户数据。优先复用现有 Vitest/脚本，在缺少关键覆盖时补最小回归用例。实现完成后创建自动化测试验证 goal，目标明确为“通过 Story AG.2 AG2-T1 中定义的测试 case”。

## 验收用例

| ID | 场景与操作 | 通过条件 |
|----|------------|----------|
| AG2-T1-TC01 | 在仓库根运行 pnpm lint:boundaries | 原34处消除，退出0，无新增违规，无缩小扫描范围/白名单/规则放宽 |
| AG2-T1-TC02 | node scripts/check-architecture-boundaries.cjs --self-test | 既有43案例在两个工作目录下全部符合预期；禁止导入仍失败 |
| AG2-T1-TC03 | 运行 pnpm lint、受影响包类型检查和现有构建 | 无本次引入的类型/构建错误；Web lint 无新增边界或其他错误，保留前后证据 |
| AG2-T1-TC04 | Web与Desktop普通Agent、Role/Project、协作入口创建会话，保存并恢复；对必需业务依赖缺失单独测试 | 标识和历史可恢复，事件/钩子不重复，缺依赖明确报错而非静默禁用持久化 |
| AG2-T1-TC05 | 不同owner并发记录、flush、整理、重新加载；另测错配owner和session-only会话 | 独立目录无串写；错配被拒绝；临时会话不写持久owner；Frozen Snapshot仅重启更新 |
| AG2-T1-TC06 | 用既有记忆JSON/JSONL、空Markdown、普通块、带容量元数据块测试共享解析；测试配置缺失、正常、损坏输入 | 数据与字段不变，解析结果与原实现一致，配置路径/优先级/错误行为不变 |
| AG2-T1-TC07 | 多次初始化工具；不同scope查询；文档/本体/定时工具成功和非法参数/未授权调用 | 注册集合完整且无重复，schema、scope、错误返回与授权语义不变 |
| AG2-T1-TC08 | 验证IPC契约类型；从桌面构建产物独立启动worker，加载并执行代表性业务工具 | 公共DTO兼容，无模块缺失，主进程/worker正确收发结果 |
| AG2-T1-TC09 | 渲染ToolExecutionFrame运行中/完成/失败及空列表，验证现有状态、名称与运行提示展示；检查两类聊天调用方 | 状态正确，空列表无异常，原props和交互兼容，ui不引用业务组件 |
| AG2-T1-TC10 | 运行受影响既有memory-core、认知provider、agent/session、工具和协作集成测试 | 无本次引入的回归；逐项记录实际测试文件与结果 |

## 自动化与人工补充

TC04/TC08 使用项目已有会话/worker测试和本地可控模型替身覆盖，不依赖真实远端模型回复。若GUI冒烟或真实模型端到端无法自动化，必须在goal输出列出原因、未覆盖项、人工步骤及剩余风险，不能标记该项已通过。

人工步骤：启动构建后的OriginOS；分别开启普通、Role和Project会话；发送消息并查看工具执行；退出重启恢复历史；核对测试账号独立目录的记忆和快照；检查失败操作的错误提示。人工检查仅补充自动化，不替代边界、持久化和打包检查。

## 完成证据

待实施后补充命令、退出码、测试数量、日志路径及限制。当前所有执行项尚未验收，不声明Story完成。

## 实施前基线（2026-09-11）

Web类型检查退出0。Core明确清单47文件635用例，620通过，15既有失败集中于capability-matcher（12）与dag-executor HITL（3）；日志 /private/tmp/originos-ag2-baseline-stable.log。agent-spawner因本地tsx缺失及Electron下载无法完成，已中止，日志 /private/tmp/originos-ag2-baseline-tests-unsandboxed.log。沙箱外node-executor七例全部通过。

## P1完成证据

提交55553c8：组件原样迁移，4调用方更新，14tests通过，Web类型检查通过，lint 0errors/2918warnings，自测43x2通过，扫描853文件剩Core33条。日志 /private/tmp/ag2-ui-{tests,lint,boundaries,selftest,typecheck}.log。

## 用户追加的通知入口修复（2026-09-11）

用户在本轮实施中报告：从通知进入技能或角色出现 CHANNEL_RUNTIME_FAILED。已确认通知携带中文 entryId，渠道层沿用仅ASCII的传输标识校验，导致 Agent 启动前被拒绝。本次作为会话入口兼容性修复纳入 AG2-T1；不变更数据格式或IPC字段。

AG2-T1-TC11：中文技能、角色与继承角色所有权的技能，经真实渠道 ingress 和桌面通知会话流能够进入运行时并完成；空白、超长、控制字符、路径分隔符与穿越标识仍被拒绝；消息/connector/actor/replyHandle 的原传输标识校验保持不变。测试先复现原错误，再验证修复。

独立通知Task仅修改channel-runtime的业务入口标识校验及对应Core/Desktop测试，Core组装Task不写这些文件。父代理负责集成，源码仍由subagent隔离实施。授权来源：用户本轮追加bug报告，延续已批准修复工作；不新增产品能力。
