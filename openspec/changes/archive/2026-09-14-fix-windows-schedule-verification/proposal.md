## Why
Windows 0.2.2已构建，但校验仍引用架构迁移前的schedule-tools路径，阻断发布。

追溯：epic-id AG；story-id AG.2；task-id AG2-T4；owner Codex；来源docs/specs/epic-AG/story-AG.2/。用户已要求修复并发布当前版本。
## What Changes
校验业务工具实际位置，按worker实际加载边界移除过期外置副本假设；补最小打包路径回归。
## Capabilities
### New Capabilities
- windows-business-tool-verification：Windows包业务工具位置与完整性校验。
### Modified Capabilities
无。
## Impact
Desktop校验脚本及测试；必要时对应打包配置。无业务API/数据迁移/依赖。源码仍在独立Task实施。通过检查后合dev推送，并用现有workflow_dispatch从修复提交重新发布0.2.2，不改已推送标签。非目标：重写校验器或迁回旧架构。回滚为撤销本Task。
