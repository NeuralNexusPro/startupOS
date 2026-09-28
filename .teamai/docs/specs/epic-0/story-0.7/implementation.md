# 开发文档 - Story 0.7

**Story:** Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移  
**版本:** 1.0  
**最后更新:** 2026-07-28

---

## 开发目标

以可回滚、可验证的方式完成 Pi Runtime 0.80.10 迁移，在不改变产品交互的
前提下提供 `pi-agent-goal` 兼容运行时。

## 实施步骤

### 1. 固化升级前基线

- [x] 记录当前依赖树、Node 版本和 lockfile 状态。
- [x] 运行 Pi Core、RoleAgent、Project Agent、流式 IPC 和打包校验测试。
- [x] 保存事件顺序、工具成功/失败和会话恢复的契约样例。
- [x] 确认工作树中与本 Story 无关的改动，不覆盖用户变更。

### 2. 对齐工具链

- [x] 在根 `packageManager`、`engines` 和 CI 中明确 Node `>=22.19.0`。
- [x] 确认 Linux、Windows、macOS workflow 使用相同 pnpm 主版本。
- [x] 增加依赖版本审计，阻止 Pi 0.82.x 或旧 Mario Zechner Runtime 混入。

### 3. 更新依赖

- [x] 将四个 Earendil Works Pi 包精确锁定为 `0.80.10`。
- [x] 将 `pi-agent-goal` 精确锁定为 `2026.7.18`。
- [x] 按上游实际要求处理 `typebox`，避免重复 runtime。
- [x] 更新 `pnpm-lock.yaml` 并验证 frozen install。

### 4. 重构适配包

- [x] 将本地 `packages/agent` 包改为 `@originos/pi-agent-adapter`。
- [x] 用显式导出替代无边界的全量 re-export。
- [x] 封装 ESM/CJS 加载方式和上游类型转换。
- [x] 替换 Core、Desktop、Web 和测试中的旧包导入。
- [x] 移除过期 ambient declaration 与旧包 mock。

### 5. 迁移核心 API

- [x] 迁移 Agent 生命周期和订阅 API。
- [x] 迁移模型定义、凭证和 `streamSimple` 适配。
- [x] 迁移消息、事件和 tool schema/result 类型。
- [x] 验证 `prompt`、`steer`、`followUp`、`abort`。
- [x] 验证 Completion Guard、RoleAgent、Project Agent 和认知钩子。
- [x] 所有类型差异使用转换函数解决，不新增 `any`。

### 6. 接入 Goal 扩展兼容层

- [x] 在 Pi 集成边界提供 `pi-agent-goal` 注册函数。
- [x] 实现测试夹具所需的 Goal 创建、查询、更新、完成和重载。
- [ ] 将产品态 Goal 扩展错误映射到现有 Agent 事件、日志和 UI 最终反馈（Story 9.41 接入后验证）。
- [x] 保持 Goal 产品入口未启用，避免越过 Story 9.41 边界。

### 7. 更新打包链路

- [x] 更新 electron-builder 配置中的依赖包含与 unpack 规则。
- [x] 更新 Windows/macOS 包校验脚本的目标模块路径。
- [x] 检查 pnpm 符号链接、ASAR 和动态 import 在 Windows 最终产物中的行为。
- [x] 保证本地构建和 GitHub Actions 使用同一安装、构建和验证命令。

### 8. 验证与文档

- [ ] 执行 `testing.md` 定义的全部自动化测试（macOS 与 NSIS installer 待平台环境）。
- [x] 创建自动化测试验证 Goal，目标为“通过 Story 0.7 定义的测试 case”。
- [ ] 在开发态完成手工烟雾测试。
- [ ] 验证 Windows、macOS arm64 和 macOS x64 产物（最新源码的 Windows zip/unpacked 已通过）。
- [x] 更新 Story 状态、变更记录和升级/回滚说明。

## 文件级改动边界

| 范围 | 允许改动 |
|------|---------|
| 根配置 | 依赖、engine、lockfile、CI 版本与审计 |
| `packages/agent` | 包名、入口、适配 API、测试 |
| Core Pi integration | 上游 API 迁移、Goal 扩展注册、契约测试 |
| Desktop | 依赖、打包配置、最终产物校验 |
| Web | 依赖和必要的类型/测试适配 |
| 文档 | Story、变更记录、升级与回滚说明 |

禁止将迁移修复写入 `dist-electron`、`.next` 或 `node_modules`。

## 兼容与迁移策略

- 用户会话和数据文件格式保持不变。
- 若上游消息结构发生变化，适配层读取旧格式并向 Core 输出稳定格式。
- 发布前保留升级前 lockfile 可定位提交，失败时整体回退依赖与适配层。
- 不同时维护 0.55.3 和 0.80.10 的运行时分支，避免行为分叉。

## 审查重点

- 是否仍有生产代码直接引用旧包或越过适配层。
- 是否存在 `any`、不安全类型断言或被跳过的事件类型。
- Tool error、模型 error、abort 是否都能到达最终 UI。
- Goal 扩展是否突破工具权限、CWD 或文件访问边界。
- Windows/macOS 校验是否检查最终包，而不是源码或构建缓存。
- CI 与本地命令是否一致且可 frozen install。

## 完成定义

只有当所有自动化测试、开发态烟雾测试和三个桌面产物验证均通过，
且 Story 9.41 可基于适配层调用 Goal 扩展时，本 Story 才能标记 Complete。
