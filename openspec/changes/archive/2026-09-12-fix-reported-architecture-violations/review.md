# 提案审查记录

**日期:** 2026-09-11
**对象:** AG2-T1 / fix-reported-architecture-violations
**状态:** 文档审查完成、等待用户批准；尚未修改应用源码。

## 独立审查

由只读 subagent review_ag2_proposal 核对设计与实际调用链，确认34处根因均有修复方向，未发现规则放宽或明显过度设计。提出并已补入以下约束：

1. PersistentAgentManager 全局实例不能在依赖组装之前注册完整业务工具；调整至启动阶段并测试冷启动/重复初始化。
2. 底层 Store 三处调用必须获得上层注入，禁止反向导入业务注册器和将服务端依赖带入浏览器构建。
3. Archival 的 insert/delete 写入策略需上移或纳入最小实际读写契约，不能漏做写入路径。
4. ToolExecutionFrame 无详情展开功能，验收只保持现有状态、名称和运行提示，不新增交互。

## 校验

OpenSpec 四类 artifact 已齐全。执行 openspec validate fix-reported-architecture-violations --strict 通过；git diff --check 通过。文档校验不等于源码验收，34处违规仍待实施。

## 批准

用户已请求处理违规；上一次“批准”对应已归档的检查器提案。本新提案完成审查后请求专项批准，尚未创建实施 Task worktree。

2026-09-11：用户对本提案明确回复“批准”，现进入隔离Task实施阶段。
