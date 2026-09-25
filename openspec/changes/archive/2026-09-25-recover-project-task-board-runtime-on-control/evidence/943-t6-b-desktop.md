# 943-T6-B Desktop 装配验收证据

## 结论

Desktop 继续只创建 Core `projectContractRuntimeHost` 并调用 `createProjectContractRuntimeComposition`。原 Session 读取、Task Runtime 恢复、CAS 重校验和控制算法均保留在 Core；Desktop 未新增恢复状态机或私有 task entry 读取。

## 覆盖范围

- wiring test 证明 Desktop 将共享 `agentSessionService` 的 `getSession` / `updateSession` 与共享 `agentManager` 的 `getOrCreateTaskRuntime` / `controlTaskRuntime` 交给 Core composition。
- IPC test 证明 Core 返回的 `runtimeAvailability: recovery_required` 与 `runtimeStatus: paused` 原样作为结构化反馈穿过 Desktop 边界。
- ontology runtime verifier 在 development 与 packaged asar 路径中要求并解析：
  - `contract-bound-runtime-composition.js`
  - `project-task-source.js`
  - `ProjectContractTaskRuntimeRecovery`
  - `RuntimeProjectTaskSource`
- runtime smoke 并发恢复同一 session/task，验证只恢复一次、不自动调用 Agent prompt，并对错误 taskId 返回 `TASK_BINDING_MISMATCH`。
- macOS / Windows package verifier 显式要求并加载恢复 composition 与 task source 模块。

## 验证

```text
pnpm --filter @originos/desktop exec vitest run   src/main/services/__tests__/ontology-cross-package-runtime-wiring.test.ts   src/main/services/__tests__/ontology-cross-package-ipc.test.ts
# 2 files / 16 tests passed

pnpm --filter @originos/desktop build
# passed

node packages/desktop/scripts/verify-ontology-runtime.js
# development module resolution, IPC wiring, process recovery, and frozen WorkItem execution ok

node --check packages/desktop/scripts/verify-mac-package.js
node --check packages/desktop/scripts/verify-windows-package.js
# passed
```

实际 macOS / Windows 安装包验证仍由 943-T6-C 在对应 release artifact 上执行；本任务已将恢复模块纳入两端 package verifier 的必需模块与 require smoke。
