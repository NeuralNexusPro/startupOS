# 概念业务分类增量

## ADDED Requirements

### Requirement: 概念业务分类与结构类型分离
CanonicalConcept SHALL 支持可选 semanticKind，取值 role、organization、object、activity、document、standard、unclassified，并支持类型化分类来源；旧 type 和稳定 ID MUST 保持兼容。缺失分类 SHALL 只读解释为 unclassified，非法枚举 MUST 拒绝。

#### Scenario: 读取旧概念
- **WHEN** 旧快照只包含 type 而没有 semanticKind
- **THEN** 系统 SHALL 成功读取并展示待分类，不自动写回、不改变引用

#### Scenario: 更新分类
- **WHEN** 用户把来料检验从待分类修正为 activity
- **THEN** 系统 SHALL 保存分类来源并保留原 conceptId、type、关系和实例绑定

#### Scenario: 非法分类输入
- **WHEN** 请求传入枚举之外的 semanticKind
- **THEN** 系统 MUST 返回校验错误且不得持久化
