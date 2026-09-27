# 访谈概念业务分类与图谱表达

## Why

当前访谈将业务对象、角色、活动统一归为 entity/class，图谱展示“类”，用户无法理解；只改标签会继续掩盖语义混淆。需要让分类进入 canonical 契约，同时保持稳定 ID 和既有运行语义。

## 可追溯信息

- epic-id: 1
- story-id: 1.7
- task-id: 1.7-T1
- owner: 项目访谈 / 本体模块维护者（实施负责人待分配）
- 来源: [Story 1.7](../../../docs/specs/epic-1/story-1.7/README.md)

## What Changes

- 增加可选的概念业务分类，贯通访谈工具、持久化、投影和中文展示。
- 支持概念按 ID 纠正分类及仅补充关系；拒绝悬空关系，不再以占位概念绕过工具限制。
- 旧项目只读展示为“待分类”，用户显式预览并确认后才补分类；不按名称自动合并。
- 记忆保存来源引用与有界模型摘要，不成为本体第二写入源。

## Capabilities

### New Capabilities

- `interview-semantic-classification`: 访谈概念业务分类与图谱表达的用户确认、同步和兼容契约。

### Modified Capabilities

- `canonical-ontology-schema`: 为 Concept 增加可选业务分类及分类来源；保持三层结构和稳定标识。

## Impact

涉及 packages/core 的 ontology、project、agent feature，project-agent 提示词及 templates/project-interview，packages/web 的访谈与本体编辑 UI，以及 Desktop/Web 边界 DTO。业务服务从 core 公共入口复用，浏览器入口不导入 Node 模块。新增数据字段/草稿文件，IPC 和 API 同步解析；不新增平台 SDK 或打包依赖。

## 非目标

不迁移旧 business-model.json，不修改现有运行实例，不自动创建任务或执行 Action，不实现规则解释器，不将标准文件直接当作可执行规则，不改发布脚本或本地打包。

## 依赖与上线

依赖 ONT.1/2/4 的 canonical/store/validator 与 ONT.8 authoring；当前代码存在不等于全部平台验收通过，实施前复核公共 API 和跨进程用例。本 Story 可先独立交付，后续 1.8 使用分类结果。
先补类型与校验，再贯通工具和 UI，最后 desktop:dev 验收。设计批准并 strict validation 通过后才实施。

## 回滚

关闭新增入口并保留 canonical 快照、草稿、审计。已发布对象被契约引用时禁止删除或降版覆盖；编辑错误通过新 revision 补偿。旧客户端是否保留新增字段须先测试，不能假定降级写入安全。
