# Design

## Context

transport actor 注入只证明调用来源，不能证明该 actor 可访问 project。实时更新已有 Task Runtime 与 collaboration 状态事件，但缺少项目范围聚合、序列缺口恢复和 renderer 生命周期管理。

## Goals / Non-Goals

**Goals:** 授权先于读取；同一事件源；revision/sequence 合并；输入稳定；监听器可回收。

**Non-Goals:** 不新增 WebSocket 服务、不跨设备同步、不替换文件事实源。

## Decisions

### Core 授权前置

新增 `ProjectAccessPort.authorize({ actorId, projectId, capability })`，capability 区分 read/control/create/assign/subscribe。`OntologyCrossPackageService` 和 Task Board service 在任何 session、Run、ontology 或 WorkItem 读取前调用；拒绝返回固定安全错误，不泄露资源是否存在。

### 复用现有事件源

Core `ProjectTaskSubscriptionPort` 订阅 Task Runtime 与 collaboration 公开事件，将同 project 的变化规范化为 `{ sequence, taskId, revision, kind }`。事件只携带摘要标识；详情继续按需读取。sequence 在宿主生命周期内单调，缺口或较旧 revision 由消费者触发快照重读。

### Desktop 精确生命周期

preload 暴露 `subscribeProjectTasks(projectId, listener): unsubscribe`；main 校验 sender 与授权，窗口销毁、项目切换或显式 unsubscribe 时释放 Core listener。一个 renderer/project 复用一个底层订阅。

### UI 合并和草稿隔离

Zustand/service 只按更高 revision 替换已加载 task；未加载 task 只标记“有更新”。sequence gap 重新请求第一页/当前详情。query、Agent/priority filter、创建表单草稿、viewMode、selected IDs 和焦点不由远端快照覆盖。

## Risks / Trade-offs

- [事件发生在分页外] → 显示有更新提示，不把未加载任务插入当前页。
- [授权在订阅期间撤销] → 服务端关闭订阅并发送固定 unauthorized 终止原因，客户端清空业务数据。
- [进程重启 sequence 归零] → host instance ID 变化视为 gap，重读快照。

## Migration Plan

授权端口先以 production adapter 注入；缺失 adapter 时 fail closed。实时订阅为增强能力，查询仍可用；上线后移除任何页面级周期轮询。
