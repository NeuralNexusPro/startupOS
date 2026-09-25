# Tasks

## 1. Core 授权与订阅

- [x] 1.1 `943-T9-A`（串行；依赖：9.42 production composition、943-T3；角色：Core authorization subagent）新增 ProjectAccessPort 并在 list/get/control/create/assign/subscribe 的任何业务读取前门控；验证未授权读取次数为零和固定安全错误。
  - 证据：`project-task-access-subscription.test.ts` 覆盖 list/get/control/create/assign 五类入口、缺失 adapter fail closed、固定 `PROJECT_ACCESS_DENIED` 响应及下游读取计数为零。
- [x] 1.2 `943-T9-B`（串行；依赖：1.1；角色：Core subscription subagent）聚合既有 Task Runtime/collaboration 公开事件为 project-scoped host/sequence/revision 摘要订阅；验证项目隔离、顺序和释放。
  - 证据：同一测试覆盖 Task Runtime/collaboration 两类公开源的 project 隔离、每项目单调 sequence、host/revision 摘要、权限撤销关闭以及最后监听器释放底层源。

## 2. Desktop 与 Web

- [x] 2.1 `943-T9-C`（串行；依赖：1.2；角色：Desktop integration subagent）实现精确 preload subscribe/unsubscribe、sender/authorization 校验和窗口销毁清理；增加 allowlist、重复订阅与泄漏测试。
  - 证据：Desktop preload 仅使用固定 subscribe/unsubscribe/event 通道并按 project 复用 listener；IPC controller 按 sender/project 复用 Core 订阅、注入 sender actor，并在显式 unsubscribe、授权撤销 close 或 WebContents destroyed 时释放。`preload.test.ts` 与 `ontology-cross-package-ipc.test.ts` 覆盖 allowlist、重复订阅、非可信 sender 和窗口销毁泄漏。
- [x] 2.2 `943-T9-D`（串行；依赖：2.1；角色：Web state subagent）按更高 revision 合并已加载任务，sequence/host gap 重读快照；后台更新保留 query/filter/form draft/view/selection/focus，卸载和项目切换清理。
  - 证据：Web service 仅接受 preload 精确订阅能力；组件按更高 revision 拉取权威详情，host/sequence 缺口重读快照，权限撤销清空业务数据，卸载与项目切换释放 listener。组件测试覆盖筛选与焦点保持、缺口恢复和 cleanup。

## 3. 验收

- [x] 3.1 `943-T9-E`（串行；依赖：2.2；角色：Security/Component QA subagent）执行 B02、B13、权限撤销、跨项目事件和 listener 泄漏矩阵；运行三包 typecheck、lint、边界、自测、diff check 与 strict validation。
  - 证据：`evidence/943-t9-e-acceptance.md`。
