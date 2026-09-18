# ONT.7 架构

## 模块落点

```text
packages/core/src/lib/features/ontology/
├── types.ts
└── index.ts
```

## 数据所有权

- ontology/facts：ONT 所有。
- contract：P2 已发布契约所有。
- run/work item/attempt：collaboration-runtime 所有。
- snapshot/projection：可重建引用视图，不拥有上述事实。

## 依赖

新增 DTO 只复用同一 ontology feature 的 ONT.1 类型。不得导入 Web、Desktop、collaboration-runtime、memory-core 或 ontology-data-store 私有实现，符合 AGENTS.md 单向依赖规则。

## 恢复边界

checkpoint reference 只定位 cursor/revision/attempt/lease epoch。恢复正确性仍依赖后续持久化回执与运行时门控，本 Task 不声称实现恢复。
