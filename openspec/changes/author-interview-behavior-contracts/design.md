# 访谈业务行为契约设计

## Context

已有 CanonicalAction、FactType、Rule、BusinessState、Transition 结构和纯 validator。ONT.8 authoring commands 当前包含 Action/BusinessState，但缺 FactType、Rule、Transition 及原子复合定义。OSDK 明确不执行任意 Rule.expression；本 Story 不能把“有定义”展示成“已能执行”。

## Goals / Non-Goals

将访谈中的业务行为形成可解释草稿，经用户确认后发布完整定义。覆盖定义层和校验消费，不覆盖执行器、规则语言、任务调度、外部平台调用、自动授权或 facts 实例写入。

## Decisions

### 活动概念与行动契约分开

“来料检验”先是 activity；只有讨论清楚作用对象、前置输入、产出、状态变化和权限要求，才能提议 Action。Action.conceptId 指向被操作对象，例如“来料批次”，不是机械指向活动概念。活动到 Action 的来源关联保存稳定 ID，不靠名称。

示例：来料批次（object），SQE（role），检验记录（document），验收规范（standard）；“检验来料批次”行动以该批次为目标，输入待检批次事实、输出检验结果事实，待检→已检。规范中的自然语言要求先作为待澄清约束；只有能表达为当前 Rule 定义且用户确认后才登记 Rule，登记仍不保证 evaluator 可用。

### 草稿生命周期

project feature 保存 `{project}/interview/behavior-drafts/{draftId}.json`，包含 project/ontology ID/version/baseRevision、draftRevision、来源消息引用、候选对象、澄清项、状态和确认摘要。状态为 collecting→ready→published；另有 needs_review、discarded。草稿不是 canonical，不可被 P2 作为正式契约消费。

初次抽取只写草稿，缺参数继续用业务语言追问。不要求用户填写技术 ID；由服务从当前快照解析完整引用。未知权限保留未决项，不以空权限表示未知；用户选择“不涉及状态/无额外权限”等才视为已回答。自然语言规则未转成定义时仍是澄清项，阻止宣称契约完整。

确认提交携带 draftId、draftRevision、reviewedHash、ontology ID/version、expectedRevision、operationId；服务重读草稿校验 hash 和权限。Agent 可以提议和修改草稿，发布必须来自用户确认交互，模型声明“用户同意”不能代替可信确认。用户修改草稿或本体变化即使先前已确认也必须重新审阅。

### 原子定义接纳

扩展 ontology 公共 authoring DTO：FactType/Rule/Transition 的 create/update/delete，以及有界批次（最多 100 条定义命令，超过返回结构化拒绝）。完整变更先在内存构造候选快照，统一 validator 校验通过后在同一项目锁内 CAS 原子替换；中间对象不落盘，允许批次内部前向引用。权限从可信边界注入，业务 metadata 不作授权依据。

记录 operationId+commandHash 的 intent、前后 revision 和回执；可复用现有 ONT.8 恢复机制，若不能证明跨进程正确则在该边界补齐。Web 与 Desktop 写同一文件时必须共用文件级互斥/CAS，不能仅进程内队列。快照提交后回执写入失败，按快照 lastOperation 与 intent 恢复原回执，禁止重复执行或标记失败后覆盖成功状态。相同 ID 不同 hash 拒绝。

草稿 published 标志在 canonical 回执后更新；该步失败时以 operationId 查询补齐。崩溃不能产生半套定义；重启不会重放外部副作用（本流程本就不执行副作用）。回滚草稿可丢弃，已发布定义只能新 revision 补偿且检查引用。

### 发布、消费与展示

复用 ONT.8 当前定义编辑的 version/revision 规则，回执同时返回二者；下游重新取权威快照校验引用，不把 authoring revision 当业务 facts revision。本文不引入新的本体版本发布算法。

访谈右侧增加“行动”视图：处理对象、输入事实、输出事实、前后状态、业务约束、权限要求、来源；草稿与已确认分区。分别展示“定义完整/待澄清”和“执行条件已校验/尚未校验/不支持规则求值”。静态 contract validator 通过不代表可运行；P2 仍经既有发布门控绑定精确 ID/version，运行仍经 Action Gate/OSDK。未实现 evaluator 保持 RULE_EVALUATION_UNAVAILABLE，不为让界面变绿删除规则。

选择草稿确认而非访谈即自动发布，避免猜测业务权限；选择原子批次而非逐个保存，避免部分契约被 P2 消费；复用 canonical 定义而非再造 workflow JSON，保持唯一事实源。

## Risks / Trade-offs

- 范围较大 → 此 Story 限于定义生成到确认闭环，运行扩展另立 Story。
- 新 Rule 可能暂不能执行 → 显示阻塞原因并保留原定义，不降低执行门控。
- 并发编辑 → 草稿 revision 与 canonical revision 分别校验；冲突保留草稿，重新预览确认。
- 跨进程锁/回执中断 → 注入故障和双进程竞争测试作为验收门槛。

## Migration Plan

先完成 1.7 和 ONT.8 基线回归，再扩展定义批次、草稿、适配及 UI。已有 activity 不自动转 Action；用户选活动发起补充访谈。关闭入口可回滚 UI，草稿与 canonical/audit 均保留。不触碰旧业务模型和 runtime facts。类型化查询 <5 秒；交互先显示草稿保存状态，模型等待与持久化等待分别观测。

## 实施边界

核心角色独占 ontology authoring/store/validator 与公共导出；访谈角色独占 project 草稿、agent 业务工具、提示词模板；适配/UI 角色写 Web、Desktop 薄边界和行动视图。全部在隔离 Task worktree。核心 DTO 完成后后两者可并行，集成与恢复测试串行；禁止在下层 integrations 中复制 feature 规则。
