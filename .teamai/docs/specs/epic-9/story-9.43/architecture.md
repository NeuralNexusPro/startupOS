# 架构：任务投影与控制边界

**状态：** Planning；2026-09-14

## 所有权

Task/Step/Criterion/Evidence/Blocker来自pi-tasks公开边界；Run/WorkItem/lease来自9.42；业务状态来自ONT。看板是聚合投影，不持久化第二个完成状态。

core项目任务服务复用现有project/agent公共API和task-runtime集成端口，新增project-scoped索引与查询/命令组合放业务层。实施前核对实际模块位置，禁止把服务塞进Web route或让integration反向依赖feature。持久索引由core data-root解析，使用DataFile JSON；不复制会话正文。

Web components → Web service/Zustand → API或Desktop IPC → core业务公共API → 注入的Task/Run/ONT端口。图与看板共用查询投影、命令结果和revision。

## 接口语义（规划）

- listProjectTasks(projectId, filters, cursor, limit)：摘要、cursor、revision。
- getProjectTask(projectId, taskId)：绑定、工作项、上下文引用、产物、可用操作。
- requestProjectTaskAction(projectId, taskId, action, requestId, expectedRevision)：经权限和状态门控后的新投影，或结构化拒绝。
- 现有事件订阅承载状态变化；缺失序列时重新读取快照。无第二事件总线。

任务创建映射持久session/branch，指派/优先级字段优先复用公开能力；必要扩展元数据按任务单独版本化。命令不直接解析私有pi-tasks entry，也不写原始事实文件。运行控制调用9.42，业务Action调用ONT；权限取交集。

## 性能与安全

分页摘要、详情懒加载；1000任务只加载当前页50条。无正文广播，项目鉴权先于查询。错误不泄露路径/凭据；并发用expectedRevision/epoch拒绝覆盖。复用React、Zustand、shadcn、Tailwind及已安装交互依赖，不引入数据库。

## 规约符合性

遵循AGENTS依赖方向和公共API；应用源码在实施Task隔离工作区。该Story不修改本体模型、不编译契约、不接管恢复算法。
