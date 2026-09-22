# ONT.7 交互设计

ONT7-T1 不新增界面。协议供 P2 生成契约引用、运行时组装 work item 上下文、恢复层定位 checkpoint；用户可见的“继续任务”和上下文查看由 Epic 9/P2 后续 Story 实现。

当版本或 lease 不一致时，本协议仅提供结构化标识；具体提示和处理动作由调用方负责。

ONT7-T2 仍不新增界面。下游以显式查询条件请求 projection；版本或 fact reference 不一致时收到结构化 issue，并保持当前任务状态不变。resolver 不返回“尽力而为”的部分上下文，避免用户在错误输入上继续执行。
