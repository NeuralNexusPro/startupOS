# Review
父代理与Core子代理已确认ABORT→remove→destroy未abort、旧流串行锁等待链。需受控pending prompt红测后才能确认具体无响应复现。复用cancel，不新增队列框架或依赖。用户无响应场景继续排查，不将其他独立错误混为根因。
