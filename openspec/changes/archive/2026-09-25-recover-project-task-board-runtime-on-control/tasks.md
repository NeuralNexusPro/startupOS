# Tasks

## 1. Core 恢复边界

- [x] 1.1 `943-T6-A`（串行；依赖：9.42 生产恢复完成；角色：Core project runtime subagent；写入：project task source、agent server composition 与测试）新增公开恢复端口，实时快照缺失时恢复原 session，恢复后重校验 revision/cursor/epoch/project/binding；验证两个全新 manager 实例下的同一 Task/Run 恢复。

## 2. Desktop 装配

- [x] 2.1 `943-T6-B`（串行；依赖：1.1；角色：Desktop integration subagent；写入：ontology cross-package composition、wiring tests 与 package verifier）注入 Core 恢复端口，验证 Desktop 只做装配、恢复中反馈和安装包模块解析。

## 3. 故障注入与验收

- [x] 3.1 `943-T6-C`（串行；依赖：2.1；角色：Recovery QA subagent；写入：故障注入/evidence/Story）验证 paused 不自启、waiting_user 保持、cancelled 不复活、旧 epoch 拒绝、响应前强退重放不重复 Action/Evidence；执行 B08、三包 typecheck、lint、边界、自测、diff check 和 strict validation。
