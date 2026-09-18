# ONT.1 架构

## 落点

```text
packages/core/src/lib/features/ontology/
├── types.ts   # canonical 类型与现有访谈类型
└── index.ts   # 已有公共出口
```

## 依赖方向

ontology feature 不依赖 Web、Desktop、collaboration-runtime、memory-core 或其他 feature 内部实现。下游仅通过 `@originos/core/lib/features/ontology` 消费。

## 关键决定

- 新类型以 `Canonical*` 命名，旧 `packages/core/src/types/ontology.ts` 不在本 Task 修改。
- 内存时间字段使用 `Date`；ONT.2 负责 JSON 序列化。
- 标识使用具名 `string` 字段；不引入品牌类型或新依赖。
- `schemaVersion` 描述结构，`version` 描述项目本体内容。

本设计符合 AGENTS.md 的目录、公共出口、三层模型与单向依赖规约。
