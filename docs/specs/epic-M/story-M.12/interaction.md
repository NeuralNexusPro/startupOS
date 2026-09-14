# 交互设计文档 - Story M.12

**Story:** Hindsight-inspired 全局用户认知与 Agent 世界模型分域  
**最后更新:** 2026-08-28

## 适用性

本 Story 首期是 core/运行时重构，不新增 UI，因此线框图、响应式布局和动画不适用。用户可见行为是不同 Agent 的个性化偏好一致，同时角色知识仍保持隔离。

## 用户流程

1. 用户与任一 Agent、RoleAgent 或 Skill 对话。
2. turn 先写入 session recall；retain 只生成带来源的候选记忆。
3. session end 或周期触发 reflect：用户偏好进入全局 user bank；世界事实/经验进入当前 Agent 或 project bank。
4. 下次启动读取已经物化的用户 Profile 与当前 Agent mental model，并按固定顺序注入 prompt。

## 状态与错误反馈

- 认知更新在后台进行，不阻塞消息响应。
- 认知存储失败时保留 recall，记录可重试状态，不向用户宣称已学习。
- 发生证据冲突时保留双方证据；未来认知管理 UI 应展示“待确认”，不得自动伪装为确定事实。
- 用户删除或更正 Profile 时，所有 Agent 下一次快照加载生效；已生成 Agent 经验不自动删除，除非其证据直接包含被删除的敏感用户信息。

## 可访问性

首期无新增 UI。后续认知管理界面必须支持键盘操作、WCAG AA 对比度、证据来源朗读标签以及可撤销的删除确认。

