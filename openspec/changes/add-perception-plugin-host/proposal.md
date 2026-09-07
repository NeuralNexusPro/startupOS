# Proposal：感知插件宿主与渠道插件化

## 追溯

- epic-id：SENSE
- story-id/task-id：SENSE.12
- owner：OriginOS Team
- 来源：`docs/specs/epic-SENSE/story-SENSE.12/`

## 动机与变更

四个渠道当前跨 Core/Desktop/Web 固化，新增渠道必须修改宿主。新增版本化 Plugin SDK、可信 bundled catalog、Desktop Host 和声明式配置 UI，并迁移 Email、WeCom、Feishu、DingTalk。

## 非目标

不提供第三方市场/远程安装/签名分发，不改平台协议、规则和授权语义。

## 影响与依赖

影响 core perception runtime、Desktop 生命周期/IPC、Web 感知中心、打包脚本与 Connector JSON；依赖 SENSE.1–11。新增 `packages/perception-plugins` workspace 并更新项目地图。

## 上线与回滚

先双读旧/新配置，再逐插件切换；验证后删除硬编码。回滚恢复旧 catalog，保留旧字段、凭据、游标和规则关联。
