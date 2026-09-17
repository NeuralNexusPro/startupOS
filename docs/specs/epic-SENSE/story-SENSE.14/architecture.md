# SENSE.14 架构

## 现状

Plugin SDK仅声明inbound-events、outbound-reply、outbound-files等能力；PluginSchedulePort是宿主定时器，不是平台日历。仓库尚无可直接复用的MCP发现／调用实现。三平台SDK/接口集合、工具服务覆盖与授权能力需实证，不能从包名或CLI技能介绍推导已集成。

## 调用链

IM消息 → 既有规则路由 → Agent业务工具（发现／调用） → Host连接能力目录与授权 → 平台插件执行 → 结果／安全审计 → 当前会话回复。

平台SDK及SDK方法映射留在perception-plugins；Core通过可选Plugin SDK接口调用。插件能力接口拟为listCapabilities和invokeCapability，仅返回可序列化描述／结果，支持AbortSignal；名称最终随实现确认。发现与执行共享一个目录版本，不新增按日历、待办分别注册的Core工具。

Core agent feature组装工具和Host依赖；integrations只接收下层通用工具协议及调用级上下文，不反向导入features/modules。上下文携带connector、来源消息、actor、conversation和session，但actor不自动变成授权主体。Desktop注入授权和IPC代理，Worker只获得宿主工具代理；Web route只做边界适配，UI复用现有管理facade。

## 来源和执行映射

每个平台实现一次能力来源适配：可信工具服务目录可直接标准化；SDK使用匹配版本的官方schema／类型和文档元数据生成目录。生成不能补造缺失权限、语义或副作用；无法分类的操作不自动开放。插件维护经过校验的operation ID到执行映射，模型参数不能指定URL、函数名或可执行代码。MCP只是可选来源，不以建设全功能通用MCP客户端为本Story前置目标。

## 数据和生命周期

目录缓存拟置于data/perception/capabilities/{connectorId}.json，使用既有安全ID校验及DataFile，记录schemaVersion、providerRevision、授权版本引用、fetchedAt和脱敏描述。凭据与授权事实仍由既有credential port/宿主所有；缓存不是授权事实源。缓存按连接、主体、授权版本隔离，目录不含函数或Secret。

连接生命周期驱动发现，刷新替换快照；版本不符的待执行工具须重新发现后校验。停用／撤权拒绝新调用并尝试取消进行中调用，外部已完成副作用不能宣称回滚。重启重建代理，验证授权后使用缓存；不自动重放未确认的写调用。

调用记录复用审计基础设施，关联callId、能力名／版本、主体引用、event/session/diagnosticId、状态及外部对象引用；查询成功、平台拒绝和结果不确定可区分。已完成或已接纳的重复调用不再次制造副作用；平台缺少幂等及状态查询能力时保留不确定态供用户核对。

## 实施范围与备选

Core接口和工具组装相互依赖，先串行冻结契约；之后三个平台文件范围可独立适配，UI/desktop补管理代理，最后统一集成。按当前用户提供的规约实施，不沿用旧的强制子代理工作流。

逐项注册办公工具会持续复制平台API，故不选；反射整个SDK缺乏语义与权限，故不选；把所有工具全量塞进prompt浪费上下文，故采用有界按需发现。运行时动态装包和任意远程目录扩大信任范围，首轮只接用户配置且受支持的平台来源。

上线默认不开启新增办公写能力；原消息插件兼容。回滚移除可选能力入口即可，不改共享记忆或原事件流水。
