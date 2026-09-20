# ONT.7 需求

## ONT7-T1 功能需求

- FR1：定义 execution/context identity，完整绑定 task 与 attempt。
- FR2：定义 decision reference、context snapshot、projection record、checkpoint reference。
- FR3：复用 ONT.1 的 source、ontology、concept 与 fact reference。
- FR4：snapshot/projection 只保存引用，不能成为事实或运行状态的第二写入源。
- FR5：公共协议从 ontology feature 入口导出，不新增依赖。

## ONT7-T2 功能需求

- FR6：按 project、ontology/version、execution identity、kind 和 revision 精确查询 projection。
- FR7：latest 查询按 projection id 选择最高 revision；同 revision 以最后追加记录为准。
- FR8：resolver 精确校验 projection context 和 fact references，并返回 canonical fact records。
- FR9：任一引用缺失、跨版本或归属错误时结构化拒绝，不返回部分结果。
- FR10：query/resolver 只读，不执行 Action、不写 facts/projection、不改变 checkpoint 或运行状态。

## 验收标准

1. 同一 Agent 的两个 work item 具有不同 context identity。
2. 快照能够定位原 contract hash、ontology version 与 fact version。
3. 检查点能够暴露 attempt/lease epoch 不一致。
4. 旧调用方无需修改，运行数据不发生变化。
5. 同一 Agent 的两个 work item/attempt 查询结果不串线。
6. latest 查询在重复 revision 下结果稳定可复现。
7. resolver 对完整引用返回精确 facts，对任一非法引用 fail closed。

## 非目标

projection 写入门控、权限授权、恢复协调、Web/Desktop/P2/runtime 适配与 UI 不属于 ONT7-T2。
