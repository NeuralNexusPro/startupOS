# Story 1.8 需求

## 用户需求

- 从访谈提取业务行为草稿，区分活动概念、Action 定义、FactType、业务状态和约束。
- 补齐统一 authoring 的事实类型、规则、状态转换与原子定义批次入口。
- 用户确认完整草稿后才写入 canonical；缺信息展示澄清项，不猜权限、不执行副作用。
- 右侧展示行动输入输出与约束，精确版本契约供 P2 校验；明确区分定义已保存与可执行。

## 验收标准

### AC1：草稿不得直接生效

系统 SHALL 保存带来源和澄清项的行为草稿；未获得可信用户确认或引用不完整时 MUST 不发布正式定义。

- Given：当前项目已有合法 canonical 绑定和受控编辑入口。
- When：访谈识别活动但未明确权限要求。
- Then：系统 SHALL 追问并保留草稿，不以空权限发布。

### AC2：完整定义原子接纳

系统 MUST 对 Action、FactType、业务状态、Transition 和 Rule 的定义批次统一校验并全有或全无提交；批次上限为100条。

- Given：当前项目已有合法 canonical 绑定和受控编辑入口。
- When：批次中任一 Action 引用了不存在的 FactType。
- Then：系统 MUST 返回定位问题且所有定义和 revision 均不变。

### AC3：确认与并发冲突检测

系统 MUST 校验草稿版本和确认摘要、本体身份及 revision、编辑权限；不得用旧确认覆盖新修改。

- Given：当前项目已有合法 canonical 绑定和受控编辑入口。
- When：用户确认期间本体 revision 已变。
- Then：系统 SHALL 保留草稿、拒绝发布并要求重新审阅。

### AC4：跨进程重试可恢复

系统 MUST 按 operationId 与命令摘要恢复唯一提交回执，跨进程竞争同一 revision 最多一次成功。

- Given：当前项目已有合法 canonical 绑定和受控编辑入口。
- When：快照保存成功但草稿 published 状态尚未落盘时进程退出。
- Then：重试 SHALL 返回原回执并修复草稿状态，不重复写定义。

### AC5：定义与执行严格区分

系统 SHALL 展示行动的对象、事实、状态、约束和来源；定义已保存 MUST 不等同可执行，未支持的规则求值仍受既有门控拒绝。

- Given：当前项目已有合法 canonical 绑定和受控编辑入口。
- When：已保存行动引用 Rule 且运行环境无 evaluator。
- Then：系统 SHALL 展示执行阻塞且不得运行或删除约束。

### AC6：确认结果供方案精确消费

系统 SHALL 只将确认后的 canonical 定义供 P2 使用，复用公共契约校验，禁止按名称推断输入输出绑定。

- Given：当前项目已有合法 canonical 绑定和受控编辑入口。
- When：方案绑定的 ontology version 与当前定义不一致。
- Then：系统 MUST 返回版本问题，不自动将引用指向同名对象。

## 非目标与依赖

范围与依赖以 [Proposal](../../../../openspec/changes/author-interview-behavior-contracts/proposal.md) 为准。无需引入新数据库、SDK 或发布产物；不改变运行事实与授权机制。

## 非功能要求

本体查询 <5 秒；1.7 初始本体工具接纳后 5 秒内投影，至少一个领域及2–3个概念；超过50节点采用虚拟化/裁剪展示。校验和写入受 project/ontology ID/version/revision 与权限约束，来源只存引用。浏览器无 Node 内建模块，深浅主题清晰可读。

## 变更历史

2026-09-27：新增设计，按语义分类与行为契约拆分；验收尚未执行。
