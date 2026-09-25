# Tasks

## 1. Core 创建编排

- [x] 1.1 `943-T7-A`（串行；依赖：P2.8 与 9.42 production composition；角色：Core project subagent；写入：project task creation service/store 与测试）实现精确 contract/template/semantic gate、project-scoped operation ledger 和 Task→Run 分阶段幂等创建；验证中断恢复、requestId 冲突、revocation/hash 和零写入 DesignGap。

## 2. Transport 与 UI

- [x] 2.1 `943-T7-B`（串行；依赖：1.1；角色：Desktop/Web transport subagent；写入：cross-package contract/service、Desktop IPC、Web service 与测试）增加查询可用 contract/template 和创建请求的薄 transport，保持错误/DesignGap 等价和敏感信息隔离。
- [x] 2.2 `943-T7-C`（可与 2.1 后半并行；依赖：接口冻结；角色：Web UI subagent；写入：project task board 创建面板与组件测试）实现选择已发布模板、绑定语义输入、手动目标 fail-closed 和权威结果刷新，不插入乐观卡片。

## 3. 验收

- [x] 3.1 `943-T7-D`（串行；依赖：2.1、2.2；角色：Integration QA subagent；写入：evidence/Story）执行 B03、B14、中断恢复与撤销并发矩阵，运行三包 typecheck、lint、边界、自测、diff check 和 strict validation。
  - 证据：`evidence/943-t7-d-acceptance.md`。
