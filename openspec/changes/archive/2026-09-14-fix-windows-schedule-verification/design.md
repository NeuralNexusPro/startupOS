## Context
schedule-tools已从integrations/pi-agent/tools迁入features/agent/tools，Windows校验四处仍引用旧位置。
## Goals / Non-Goals
校验与实际ASAR/worker加载关系一致，缺少真实业务工具仍应失败。不复制业务代码回基础设施，不降低运行时检查。
## Decisions
检查所有旧路径调用，复用当前打包和worker运行机制；仅修正失效路径/要求，避免新增运行时副本。测试用最小临时包或已有脚本测试方式覆盖新位置成功、缺真实文件失败、旧位置不再要求。无新依赖。
## Risks / Trade-offs
只替换外置路径可能仍要求不存在副本，须先追踪worker从ASAR加载业务工具的事实；Windows最终以远端CI验收，本地仅验证跨平台脚本/真实已有包。
## Migration Plan
子代理Task修改verify-windows-package.js及相应测试，必要打包配置变更须说明证据。父代理集成、goal、文档归档并推送dev，通过workflow_dispatch publish=true重试0.2.2，无标签改写。
