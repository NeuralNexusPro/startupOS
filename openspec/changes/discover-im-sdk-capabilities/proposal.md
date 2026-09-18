## Why

当前IM插件仅提供事件、回复和文件能力，Agent无法发现平台SDK中的办公操作。用户希望一次接通能力发现机制，后续新增日程、待办等操作由可信能力目录驱动，而非逐项修改Core工具。

- epic-id: SENSE
- story-id: SENSE.14
- task-id: SENSE14-T1
- owner: 待分配（规划：Codex）
- 来源：docs/specs/epic-SENSE/story-SENSE.14/README.md
- 状态：Implemented（本地完成，待提交）；Core、Worker代理、管理UI及三平台provider已实施，企微真实授权闭环通过；飞书、钉钉真实业务操作仍待授权环境验证。

## What Changes

- 新增连接级能力目录、按需搜索和调用通路；平台插件持有SDK与协议，Core只处理描述、授权、路由和审计。
- 能力目录优先读取可信机器可读工具服务；仅有SDK时，由其匹配版本的官方接口描述／类型元数据生成可审核目录。SDK无描述时明确报告未支持，不运行时猜测参数或任意枚举调用。
- Agent通过固定的发现／调用工具使用连接能力，完整schema按需返回，不全量注入提示词。
- 连接能力与当前授权主体、范围和目标Agent工具策略求交；聊天发送者不自动获得授权账号权限。
- 感知中心展示“消息连接”和“可用能力／待授权能力”，刷新及撤权无需重启。
- 用日程、待办作跨平台验证场景；增加一个同描述格式的操作时不改变Core、IPC或工具注册代码。

## Capabilities

### New Capabilities
- `im-capability-discovery`: 可信能力目录、按需发现、授权调用、生命周期及可观测性。

### Modified Capabilities
无。既有IM事件／回复能力继续兼容；新增插件能力为可选扩展。

## Impact

涉及core Perception Plugin SDK/Host、channel-runtime调用上下文、agent业务工具注册、三平台插件、Desktop IPC与Worker代理、Web感知中心适配及实际包验证。
依赖SENSE.12的插件边界和现有工具授权机制；不依赖SENSE12-T9记忆修复，当前来源上下文仍必需。能力目录及版本缓存使用DataFile，不新增数据库。凭据保留宿主安全存储，模型及renderer不得获取。
新增可选SDK公共接口、脱敏管理API/IPC和Worker工具代理；平台SDK/目录资源是否需打包由来源盘点确认，不预先引入新依赖。

非目标：全量办公套件手工封装、自动申请权限、绕过平台限制、任意URL工具服务、记忆隔离、日程变更订阅和跨平台同步。

上线：先完成三平台能力来源及授权实证，明确支持范围；用户显式启用办公能力后按连接开放。回滚：停用新增能力入口，保留消息收发、历史记录、目录缓存和审计；外部平台已产生的操作不自动撤销。
