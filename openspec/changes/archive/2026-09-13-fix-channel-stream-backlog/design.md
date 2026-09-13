## Context
SENSE12-T5：企微每片累计全文经SDK等待ACK；共享发送器没有合并，旧实际ASAR在96个文本片段、25ms模拟ACK下发98次、耗时2633ms，文本与98回执均正确。目标是降低等待ACK造成的尾延迟。
## Goals / Non-Goals
首包不增加人为延迟，减少积压请求，保留文字、顺序、真实回执与失败语义。不改变LLM、文件接口、飞书SDK节流或钉钉终态文本策略。
## Decisions
使用Node Readable.from(objectMode:true,highWaterMark:32)适度预取；每次仅同步合并已经缓冲的最多32个连续text_delta，flowId/port/kind相同。非文本、不同流或已delivered回执是屏障，不跨越；没有新片段则立即发，不添加timer等待。相较按字发送减少ACK轮次，相较终态一次发送保留流式体验，相较无界自建队列复用标准库。
合并组固定后按既有maxAttempts重试同一payload；为每个原packetId保存同一次真实ACK/失败状态和attempt，重放已成功包不重复发送。回执持久化放在网络重试catch外；磁盘失败直接抛出，不能把已成功网络发送重试。源生成器异常先记录，排空先前产出的文本后再抛出，不能合成completed；退出关闭Readable并触发源清理。
HWM32另有当前组和最多一次进行中读取，不宣称所有上游队列总驻留严格32。既有fan-out队列和没有取消参数的底层发送接口保持不变。
企微delta构造候选累计文本，await replyStream成功后再写state.content；其他覆盖式文本也保持确认后提交，终态状态不改接口。共享层与插件独立Task并行，不引入平台SDK到Core。
## Risks / Trade-offs
网络超时可能已送达，但企微累计全文重复发送应保持相同内容，不能重复追加delta。不提供exactly-once承诺；保留现有重试上限。无新增依赖、公共API和持久化格式变更。
## Migration Plan
单元/组件既有回归、模拟ACK基准、完整桌面包内对照验收后合入dev。回滚源码即可恢复旧策略；真实企微体验由用户在新包联机复核。
