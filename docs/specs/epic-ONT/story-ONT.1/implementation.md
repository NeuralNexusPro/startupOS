# ONT.1 实施

## ONT1-T1

1. 在 ontology feature `types.ts` 增加 schema version 常量及 canonical 类型。
2. 保持 `index.ts` 的既有公共导出覆盖新增类型。
3. 增加最小 TypeScript 正反示例，验证必需字段、稳定引用和 `unknown` 扩展值。
4. 运行 core typecheck、相关测试与架构边界检查。

## 明确延后

- ONT.2：codec 与存储。
- ONT.3：旧模型迁移。
- ONT.4：运行时 validator。
- ONT.7：完整 Context Projection 协议。
