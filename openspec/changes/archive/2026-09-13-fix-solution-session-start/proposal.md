# 修复项目解决方案会话启动
epic-id: P2
story-id: P2.1
task-id: P21-T2
owner: Codex
来源：docs/specs/epic-P2/story-P2.1/

## 动机
点击 AI 解决方案设计后无响应。真实日志显示会话创建成功但消息归属校验失败，界面调用非流式发送且未展示错误。
## 变更内容
明确 solution-design 技能身份，使用真实流式发送；项目内 Skill 持久化项目与入口身份精确一致时允许发送。跨项目、跨入口仍拒绝，启动和发送错误可见。
## 能力
### 新增能力
- `solution-session-start`：项目内解决方案技能安全启动与错误展示。
### 修改能力
无。
## 影响
Web SolutionDesign、Core session-restore 与测试，无新依赖、数据库、IPC 格式变化。
## 非目标、依赖与交付
不改方案算法、模型配置或历史策略。复用 Skill launcher 和 Hook，验证后合入 dev。回滚源提交即可，无用户数据迁移。
