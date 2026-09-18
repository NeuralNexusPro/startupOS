# ONT.7 需求

## ONT7-T1 功能需求

- FR1：定义 execution/context identity，完整绑定 task 与 attempt。
- FR2：定义 decision reference、context snapshot、projection record、checkpoint reference。
- FR3：复用 ONT.1 的 source、ontology、concept 与 fact reference。
- FR4：snapshot/projection 只保存引用，不能成为事实或运行状态的第二写入源。
- FR5：公共协议从 ontology feature 入口导出，不新增依赖。

## 验收标准

1. 同一 Agent 的两个 work item 具有不同 context identity。
2. 快照能够定位原 contract hash、ontology version 与 fact version。
3. 检查点能够暴露 attempt/lease epoch 不一致。
4. 旧调用方无需修改，运行数据不发生变化。

## 非目标

append/query API 实现、JSONL 存储、恢复协调、权限门控与 UI 不属于 ONT7-T1。
