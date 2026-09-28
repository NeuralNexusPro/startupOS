# 需求定义 - Story 9.4

**Story:** 依赖注入配置（CollaborationRuntimeDeps）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为协作运行时模块，我需要定义清晰的外部依赖接口，使模块内部不耦合任何具体实现，这样可独立测试且未来可替换底层基础设施。

---

## 功能需求

1. **CollaborationRuntimeDeps 接口** — 定义模块所需的全部外部依赖
2. **模块内部禁止 import** `src/lib/` 或 `src/components/` 下的任何模块
3. **全部依赖通过构造函数注入**

## 边界条件

- 接口可完整 mock（支持单元测试）
- TypeScript 编译通过，无 `any` 类型

## 验收标准

- [ ] 模块内部零 `src/lib/` 或 `src/components/` import
- [ ] 全部依赖通过 `CollaborationRuntimeDeps` 注入
- [ ] 接口可完整 mock（支持单元测试）
- [ ] TypeScript 编译通过，无 `any` 类型

## 依赖关系

- [设计文档 §5.5 依赖注入](../../design/multi-agent-runtime.md#55-依赖注入)
- [设计文档 §2.0 模块层与集成层的关系](../../design/multi-agent-runtime.md#20-模块层与集成层的关系)
