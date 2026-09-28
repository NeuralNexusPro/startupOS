# 开发文档 - Story PERF.1

**Story:** 桌面日志按日期滚动  
**版本:** 1.0  
**最后更新:** 2026-07-27

## 开发目标

用可测试的每日日志写入器替代 `main.ts` 中启动时固定的 `desktop.log` 和 `llm.log` 路径，使跨日运行自动切换文件且不改变现有日志内容和失败隔离行为。

## 实施步骤

### 1. 建立测试基线

- [x] 为本地日期格式化、channel 文件名和追加语义编写失败测试。
- [x] 为跨日不重启、系统时钟回拨和旧文件兼容编写测试。
- [x] 为目录不可写、append 抛错和 console 非递归编写测试。

### 2. 新增每日日志写入器

- [x] 新建 `packages/desktop/src/main/services/daily-log-writer.ts`。
- [x] 定义 `LogChannel`、可注入时钟和 append 适配。
- [x] 使用本地日期字段生成固定宽度日期。
- [x] 仅在实际 append 时创建日志目录。
- [x] 捕获文件系统错误并返回可判断结果，不调用全局 console。

### 3. 接入 desktop 日志

- [x] 删除固定 `desktopLogPath` 状态。
- [x] `appendDesktopLog` 调用统一 writer。
- [x] 保留 console 级别、异常监听和原始输出顺序。
- [x] 初始化消息显示当日目标文件或文件名模式。

### 4. 接入 LLM 日志

- [x] 删除初始化时固定的 `llmLogPath`。
- [x] 命中 `shouldWriteLlmLog` 后调用统一 writer。
- [x] 保留现有前缀、时间戳、序列化和失败诊断语义。
- [x] 验证一条 LLM console 日志按现有设计分别进入 desktop 与 LLM 文件，不因代理嵌套额外重复。

### 5. 验证

- [x] 运行 Desktop 单元和集成测试。
- [x] 运行 Desktop TypeScript build。
- [x] 运行 `pnpm lint` 和架构检查。
- [ ] 在 Windows 与 macOS 打包验证中检查运行日志文件名。
- [x] 创建自动化验证 goal，目标为通过 PERF.1 `testing.md` 中的测试用例。

## 文件级改动范围

| 文件 | 操作 |
|------|------|
| `packages/desktop/src/main/services/daily-log-writer.ts` | 新增 |
| `packages/desktop/src/main/services/__tests__/daily-log-writer.test.ts` | 新增 |
| `packages/desktop/src/main/main.ts` | 修改 |
| `packages/desktop/src/main/__tests__/log-capture.test.ts` | 新增或按现有测试布局调整 |

## 迁移与兼容

- 不执行旧日志迁移，避免启动阶段扫描或大文件移动。
- 不删除旧文件，用户可继续用于历史诊断。
- 当日日志在应用重启后继续追加。
- 文件名契约发布后由 PERF.2 的归档清理逻辑直接消费。

## 审查要点

- 是否错误使用 `toISOString().slice(0, 10)` 作为本地日期。
- 是否仍有启动时固定日志路径，导致跨日不切换。
- 是否在失败处理里调用被代理的 console 形成递归。
- 是否覆盖或迁移了旧日志。
- 是否改变 LLM 日志过滤范围、级别或正文。
- 是否引入目录扫描、同步压缩等非本 Story 工作。
