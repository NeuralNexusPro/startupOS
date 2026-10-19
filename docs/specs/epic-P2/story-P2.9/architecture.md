# 架构设计 - Story P2.9

## 数据流

```text
Solution Design UI
  -> Core Solution Acceptance Service
  -> manifest.topologyViews.nodes[].hitlPolicyId
  -> manifest.executionContract.hitl[]
  -> immutable SolutionExecutionContract
  -> Collaboration WorkItem verifier
  -> optional persistent HITL
  -> completed / revision / failed
```

自动验收不创建 `after_verification` HITL；用户确认使用稳定 `approverRole: user`；指定角色确认保存角色 ID。运行时只消费已发布契约，不能修改策略。

## 边界

- Core solution feature 拥有校验、原子写入和契约编译。
- Web/Desktop 仅做适配。
- collaboration runtime 通过 solution 公共类型读取冻结策略，不依赖 Web。
