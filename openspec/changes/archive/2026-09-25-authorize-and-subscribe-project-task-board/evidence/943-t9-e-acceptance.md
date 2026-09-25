# 943-T9-E Acceptance

- B02：ProjectAccessPort 在 list/get/control/create/assign/subscribe 的业务读取前执行；拒绝使用固定 `PROJECT_ACCESS_DENIED`，下游读取次数为零。
- B13：Web 只合并更高 revision；host 或 sequence 缺口重读权威快照，保留 query/filter/form/view/selection/focus，卸载与项目切换释放 listener。
- Desktop 仅暴露固定 subscribe/unsubscribe/event channel；按 sender/project 复用订阅，非可信 sender 拒绝，WebContents 销毁自动清理。
- 权限撤销关闭订阅并清空 Web 业务数据；Core 测试覆盖跨项目事件隔离和最后 listener 对底层源的释放。
- Core 22 files / 169 tests、Web 5 files / 53 tests、Desktop 3 files / 26 tests 通过；三包 typecheck、lint、边界、自测、strict validation 与 diff check 通过。
