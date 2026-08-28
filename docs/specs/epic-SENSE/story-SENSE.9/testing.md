# SENSE.9 测试

自动化验证 Goal：通过感知中心入口、连接管理、规则向导、事件追溯与 replay 用户流程。

覆盖：首页打开/关闭/恢复窗体；四类连接表单；secret 不回显；创建合法规则与阻止未授权目标；禁用 connector；查看 event/lease/result；确认 replay；API 失败与离线；键盘/焦点/ARIA；400×300 和宽屏；>50 记录虚拟化；首窗渲染 <1 秒。执行组件测试、API 集成、Playwright E2E、typecheck 与 lint。

## 自动化结果（2026-08-28）

- Web 感知中心与 API：5 个测试文件、20 个测试通过。
- Core 感知运行时与管理 Facade：10 个测试文件、51 个测试通过。
- Core/Web TypeScript：通过。
- 全仓 lint：0 error；2848 个仓库既有 warning，其中包含本 Story 的非阻断风格 warning。
- `git diff --check`、Core→Web/Desktop 反向依赖扫描、`homeApps.ts` 入口隔离：通过。
- 组件计时环境中首窗内容渲染 <1 秒；事件列表每页最多 50 条，避免一次渲染无界增长。

## 无法自动化的浏览器验收

仓库未安装 Playwright/Cypress，也没有 E2E 配置，因此本 Story 未伪造浏览器 E2E 结果。上线前人工执行：

1. 在 Web 与 Electron 首页确认感知中心是与应用启动器、项目、角色、技能平行的顶层能力。
2. 打开、最小化、恢复、最大化和关闭感知中心；分别验证 400×300 与宽屏布局。
3. 使用键盘遍历四区、表单、分页和重放确认；检查焦点可见且状态不只依赖颜色。
4. 使用真实 secret provider 绑定引用并重启应用，确认凭据可解析且 UI/API/日志均不回显引用或真实密钥。
5. 使用真实租户验证四平台连接测试、回调/Stream 状态和 DLQ 重放。

剩余风险：jsdom 不能覆盖真实浏览器布局、Electron 原生窗口生命周期、厂商凭据解析和网络协议行为。
