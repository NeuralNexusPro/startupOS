# ONT.2 需求

- FR1：canonical ontology 存为版本化 DataFile JSON，原子替换。
- FR2：定义并追加 versioned fact、operation receipt、projection、migration records。
- FR3：同 store 同文件写入串行，读取恢复尾部截断。
- FR4：显式 Date codec，拒绝路径遍历。
- FR5：按 operationId 返回最后回执，保留全部历史。

非目标：旧数据迁移、Action/权限校验、跨进程锁、数据库、Web/Desktop adapter。
