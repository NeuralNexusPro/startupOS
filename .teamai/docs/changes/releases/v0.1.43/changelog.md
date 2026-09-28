# OriginOS CE v0.1.43 Changelog

发布日期：2026-07-26

## 新增

- 自定义 Skill、Agent 和 RoleAgent 窗体支持将完整工作目录导出为 ZIP。
- 导出完成后通过系统文件管理器定位生成的 ZIP。
- 系统内置 Skill 根据 `originos-system` 元数据隐藏并拒绝导出，不依赖硬编码技能名称。

## 修复

- 修复 GPT-5.x 等模型只返回阶段计划便以 `stop` 结束，导致任务未实际完成的问题。
- 增加语义完成判定；任务未完成时自动续跑，恢复耗尽时向用户返回明确原因。
- 修复 Windows 下 `generate_file_url` 对 `data\...` 路径判断错误的问题。
- 修复完成判定恢复消息和最终结果未完整同步到技能窗体的问题。
- 补齐 Desktop 开发态及安装包中的 `archiver`、`uuid` 等运行时依赖。

## 验证

- Pi Agent 完成判定、错误恢复与文件 URL 自动化测试通过。
- Desktop 导出服务与路径安全测试：21 项通过。
- Core 技能元数据测试：2 项通过。
- Web 导出按钮与系统技能策略测试通过。
- Desktop TypeScript 编译通过。
- Windows 与 macOS 安装包、签名、更新元数据和七牛资源由 GitHub Actions 发布链路验证。
