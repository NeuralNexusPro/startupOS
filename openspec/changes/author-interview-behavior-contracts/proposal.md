# 访谈业务行为契约草稿与确认

## Why

业务活动目前只成为概念和关系，无法表达行动需要的输入、输出、状态和约束。已有 Action 编辑不能一次接纳其关联 FactType、Rule 和状态转换，需要可解释、可确认、可恢复的完整定义流程。

## 可追溯信息

- epic-id: 1
- story-id: 1.8
- task-id: 1.8-T1
- owner: 项目访谈 / 本体模块维护者（实施负责人待分配）
- 来源: [Story 1.8](../../../docs/specs/epic-1/story-1.8/README.md)

## What Changes

- 从访谈提取业务行为草稿，区分活动概念、Action 定义、FactType、业务状态和约束。
- 补齐统一 authoring 的事实类型、规则、状态转换与原子定义批次入口。
- 用户确认完整草稿后才写入 canonical；缺信息展示澄清项，不猜权限、不执行副作用。
- 右侧展示行动输入输出与约束，精确版本契约供 P2 校验；明确区分定义已保存与可执行。

## Capabilities

### New Capabilities

- `interview-behavior-contract-authoring`: 访谈业务行为契约草稿与确认的用户确认、同步和兼容契约。

### Modified Capabilities

无。既有 validator、OSDK 和 contract validator 的权限及执行约束保持不变；定义批次扩展在新能力中约束，复用 ONT.8 authoring。

## Impact

涉及 packages/core 的 ontology、project、agent feature，project-agent 提示词及 templates/project-interview，packages/web 的访谈与本体编辑 UI，以及 Desktop/Web 边界 DTO。业务服务从 core 公共入口复用，浏览器入口不导入 Node 模块。新增数据字段/草稿文件，IPC 和 API 同步解析；不新增平台 SDK 或打包依赖。

## 非目标

不迁移旧 business-model.json，不修改现有运行实例，不自动创建任务或执行 Action，不实现规则解释器，不将标准文件直接当作可执行规则，不改发布脚本或本地打包。

## 依赖与上线

依赖 ONT.1/2/4 的 canonical/store/validator 与 ONT.8 authoring；当前代码存在不等于全部平台验收通过，实施前复核公共 API 和跨进程用例。依赖 1.7 分类字段；P2 仅消费确认后的精确 ID/version，不由本 Story 改动调度器。
先补类型与校验，再贯通工具和 UI，最后 desktop:dev 验收。设计批准并 strict validation 通过后才实施。

## 回滚

关闭新增入口并保留 canonical 快照、草稿、审计。已发布对象被契约引用时禁止删除或降版覆盖；编辑错误通过新 revision 补偿。旧客户端是否保留新增字段须先测试，不能假定降级写入安全。
