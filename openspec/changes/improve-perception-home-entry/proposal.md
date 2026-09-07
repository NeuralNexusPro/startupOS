# Proposal：优化感知中心首页入口

## 追溯

- epic-id：SENSE
- story-id：SENSE.13
- 来源：`docs/specs/epic-SENSE/story-SENSE.13/`

## 动机与变更

现有整行入口视觉权重过高，却没有表达连接健康。将“感知与连接”纳入应用启动器并支持 Dock，同时在顶部系统栏增加连接状态快速面板，复用既有感知中心窗体。

## 非目标

不改感知中心内部管理、Connector 协议、规则、通知或凭据存储。

## 影响

仅影响 Web 首页配置、动作分发、顶部系统栏和 sense-center 展示组件；显式替代 SENSE.9 的旧入口层级决策。
