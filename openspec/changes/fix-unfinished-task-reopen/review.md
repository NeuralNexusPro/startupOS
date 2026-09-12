# Review
父代理及两子代理审查：不能逐个GET探测任务（会启动），需既有列表摘要；复用现有restore和generation，不新建任务引擎。恢复不自动重试真实失败/暂停/等待任务。UI/runtime写入边界不重叠。
