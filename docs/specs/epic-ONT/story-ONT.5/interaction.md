# ONT.5 交互设计

ONT5-T1 无 UI。调用方通过判别联合结果处理成功与结构化 issues，不依赖异常文本。查询默认返回匹配历史；`latestOnly` 返回每个 factId 的最新 revision。Action 调用方提交稳定输入引用、输出草稿、operationId、expectedRevision、权限与审计上下文；成功获得 accepted 回执，重复请求获得同一结果。
