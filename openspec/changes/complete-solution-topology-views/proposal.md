# 方案图谱视图闭环

## Why
0.4.x 审计确认 P2.7 尚未形成完整产品能力，需要补齐真实入口并验证，而不是只保留孤立组件。

## What Changes
- epic-id: P2；story-id: P2.7；task-id: P27-T1；owner: Codex。
- 来源：docs/specs/epic-P2/story-P2.7/README.md。
- 在所有方案图谱入口提供工作流 / 团队视图切换。
- 显式渲染 Agent、Skill、调用和输出边；团队视图识别共享技能，工作流按步骤/数据流组织。
- 展示 canonical I/O 完整引用、Action、权限，同时保留旧 manifest 可读兼容。
- 验证真实组件交互、孤立/缺失引用、共享技能、切换性能与键盘访问。
- 用户已以“帮我按照这个推进吧”批准审计建议；采用 0.4.x 为集成线，本轮不推送、不打包、不清理现场。

## Capabilities
### New Capabilities
- `solution-topology-views`: 方案图谱视图闭环。
### Modified Capabilities
无；复用既有语义校验、发布和执行门控。

## Impact
- 受影响文件只在 packages/web/src/components/solution 及测试和 P2.7 文档；不修改 core types（P2.6 所有）、API 或 runtime。
不引入数据库或依赖。非目标：修改本体权限、静默迁移、发布打包。依赖既有 P2.8/ONT.7/9.42 公共接口；实现与另两任务文件独立可并行，最终集成按 P2.6→P2.7→9.36 串行回归。上线为本地 0.4.x 合并；回滚撤回提交，不删除用户数据。
