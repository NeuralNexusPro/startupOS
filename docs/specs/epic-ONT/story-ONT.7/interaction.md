# ONT.7 交互设计

ONT7-T1/ONT7-T2 不新增界面。协议供 P2 生成契约引用、运行时组装 work item 上下文、消费者查询/解析 projection、恢复层定位 checkpoint；用户可见的“继续任务”和上下文查看由 Epic 9/P2 后续 Story 实现。

当 project、版本、引用或 revision 不合法时，OSDK 返回结构化 issues；具体提示和处理动作由调用方负责。不安全 project 路径标识保持 store 的既有 `TypeError`。attempt/lease 是否当前有效仍由 runtime 判断。
