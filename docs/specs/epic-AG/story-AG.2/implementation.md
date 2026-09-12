# 开发文档 - Story AG.2

**任务:** AG2-T1；**更新:** 2026-09-12；**状态:** 已合入 dev 并归档。

## 实际实现

公共服务端组装入口为 `@originos/core/lib/features/agent/server`。AgentManager保留在integrations，由上层传入工具和记忆组装；PersistentAgent通过sessionPersistence保存会话。Pattern、记忆提供者组装、业务工具、项目持久Agent管理和skill evolution移到agent feature；通用registry与底层运行时保持独立。

IPC/Skill/UserRegistry契约移至types，配置读写移至storage，记忆解析与权限提示移至shared，业务层向下重导出。ToolExecutionFrame原样归位ui/chat，四个调用方同步调整。[34条修复映射](boundary-fixes.md)记录每处原诊断。

用户追加通知bug：合法中文技能/角色目录名被ASCII渠道校验拒绝。仅业务入口与角色owner改用目录标识校验，仍拒绝空白/超长/控制字符/分隔符/点穿越，项目及传输标识规则不变。

恢复验证发现Agent复用时重复设置相同base prompt会覆盖记忆快照；现记录base prompt，仅真正变更时更新，保留Frozen Snapshot。根产物检查精确识别真实.eslintrc.cjs配置，其他根JS产物仍拒绝。

## 实施与审查

- 8585b9c：记录用户批准；UI/Core独立工作树实施，Core内部再隔离contracts。
- 55553c8：通用聊天组件归位。
- 8d1848b、21ebcf7：契约下沉与Core业务依赖修复。
- 74fd279：恢复/快照修复、真实worker验收及根构建检查兼容。
- 1895ada：通知Unicode入口修复，先红后绿。
- 0be79c7：Desktop组装单测隔离Electron宿主，避免测试时下载二进制；生产代码未变。

未新增运行时依赖、未修改用户数据格式、未放宽架构规则。父代理负责集成和证据，不在Proposal工作树直接实施源码。

## 验证与运行

完整 `pnpm desktop:build` 通过。`node packages/desktop/scripts/verify-agent-business-runtime.js` 在独立进程验证skill和persistent worker先冷启动ready，再检验完整工具注册、文档读取、越界拒绝、幂等初始化、关闭和持久会话落盘；不请求远端模型。

最终测试与限制见 [testing.md](testing.md)。本地macOS arm64应用输出到主仓库release/mac-arm64/OriginOS CE.app；打包后的实际验收证据将在交付记录补齐。真实远端模型和人工GUI通知点击不作为自动化通过声明。

## 回滚

回退本Proposal集成提交即可，无数据迁移步骤。保留本地测试产物和证据后清理已合并工作树。

## 2026-09-12 最终交付验证

追加提交 3b926df 将 React Store 保留在独立公共入口 features/agent/local-store，服务端业务入口不再加载 React。实际 Electron ASAR 中 skill/persistent 两类 worker 冷启动、业务工具注册、路径授权和关闭均通过；持久会话落盘通过。完整桌面重编译和 macOS arm64 本地打包通过。

交付：dev 合并提交 7e652ea；Proposal 与四个 Task 工作树和分支均已清理。用户后续报告的“旧会话恢复后再次发送 channel 错误”另行排查，未将该未复现问题列为已解决。

## AG2-T2 旧会话通知继续发送

缺少 entryType 的旧会话原被误判为项目，中文角色/技能 ID 触发 CHANNEL_RUNTIME_FAILED。提交 a2cf514 在显式元数据缺失时按持久 agentType 回退，标准 skill- 前缀还原入口 ID；保持原会话和项目存储位置，项目/路径安全校验不变。测试见 TC12。
