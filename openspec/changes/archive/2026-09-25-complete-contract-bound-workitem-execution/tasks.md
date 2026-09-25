# Tasks

## 1. 可恢复执行协议

- [x] 1.1 `942-T3-A`（串行；依赖：Proposal strict validation；角色：Collaboration ledger subagent；写入：facade contract execution 与定向测试）将执行改为短事务 CAS 阶段机，增加 readiness、budget、terminal aggregation、持久 HITL 和 mutation lock ports；验证嵌套 Action 无死锁、双宿主冲突、暂停/取消/旧 lease 和三类 HITL 恢复。证据：portable commit `0425016dbad504605522538169220a3a8ab15dcd` 已集成；facade 41/41、当前组合定向 39/39 与 Core typecheck、diff check 通过。完整 Core suite 的 143 个既有失败集中于未修改的 pi-agent hook 环境与 Memory.md 大小写夹具，未据此扩大本任务通过范围。

## 2. 真实运行适配

- [x] 2.1 `942-T3-B`（串行；依赖：1.1；角色：Agent runtime subagent；写入：agent server Worker adapter 与测试）实现按 run/workItem/attempt 隔离的 Agent/Skill Worker，精确解析 frozen contract target，支持 artifact/fact refs、abort 和 checkpoint；验证同 Agent 并发不串上下文。证据：portable commit `fdd1bef7764e3e43c801c9d861daf16b12f9f24c` 已集成；Worker+ledger 回归 32/32、Core typecheck、目标 lint 与 diff check 通过。
- [x] 2.2 `942-T3-C`（可与 2.1 并行；依赖：1.1；角色：Verifier/ONT subagent；写入：collaboration integrations 与测试）实现版本化 verifier registry、evidence schema、ONT outcome commit 和稳定 evidenceHash；验证 unknown/placeholder/schema mismatch 拒绝及 Action 后恢复不重复。证据：portable commit `58e19877b0ccc80361b1de084a90452c72a6d81a` 已集成；适配器相关 41/41、当前 ONT/阶段机组合 25/25、Core typecheck、923 文件边界扫描和架构 self-test 通过。

## 3. 生产组装与验收

- [x] 3.1 `942-T3-D`（串行；依赖：2.1、2.2；角色：Project server integration subagent；写入：Core composition factory、Web/Desktop 薄装配与 wiring tests）统一生产 runtime host，注入 Worker/Verifier/HITL/Action/Evidence/lock；验证 Web/Desktop 语义一致且不再返回 `WORKER_UNAVAILABLE`。证据：Core 唯一 `createProjectContractRuntimeComposition()` 已接入隔离 Agent/Skill Worker、显式版本化 artifact verifier/evidence schema、ONT Action outcome、父 Session HITL、pi-tasks Evidence 与文件锁；Web/Desktop 仅传入相同 host 单例。相关 Core 58/58、Web 14/14、Desktop 12/12 测试通过，三包 typecheck（Web 在隔离分支补入已完成的 9.43 fixture 后通过）、927 文件边界扫描、自测与 diff check 通过。
- [x] 3.2 `942-T3-E`（串行；依赖：3.1；角色：Recovery QA subagent；写入：故障注入、package verifier 与 Story evidence）覆盖每个阶段强退、同 Agent 多任务、双进程 CAS、预算、HITL、run terminal 与安装包 frozen WorkItem smoke。证据：生产 composition 的真实文件故障矩阵 7/7 通过；开发态与最小 app.asar package verifier 均实际完成 frozen WorkItem 并验证重启不重复执行；详见 `evidence/942-t3-e-recovery-qa.md`。
- [x] 3.3 `942-T3-F`（串行；依赖：3.2；角色：Proposal integration owner；写入：Proposal/Story evidence 与 Git refs）运行受影响回归、三包 typecheck、lint、边界、自测、diff check 和 strict validation，完成 9.42 verification goal，合并 Task branches 到 `0.4.x` 并清理 worktree。证据：集成工作树 Core 14 files/93 tests、Web 8 files/34 tests、Desktop 2 files/12 tests 通过；三包 typecheck、lint 0 errors、939 文件边界扫描、43×2 架构自测、strict validation 与 diff check 通过。
