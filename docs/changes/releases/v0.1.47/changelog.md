# OriginOS CE v0.1.47 Changelog

发布日期：2026-08-07

## 修复

- 修复 Windows 多 Agent worker 的 ESM 模块 URL 解析。
- 将 CompletionGuard 限定在 Agent、RoleAgent 和技能窗体，避免项目访谈的正常追问被误判为失败。
- 修复 Project Agent 依赖技能复制到项目 data 目录的流程。
- 将尚未创建 `business-model.json` 视为新项目的正常状态。
- 修复 Project Skill Provisioning 的公共 API 导入。

## Runtime 与发布

- 引入受控 Pi Task Runtime 适配边界、版本和打包完整性校验。
- 修复 Windows/macOS 打包后的 Runtime 路径、patch fingerprint 和 manifest 校验。
- Desktop Release 不再要求或上传 `.zip.blockmap`；保留 DMG/EXE 自动更新所需的 blockmap。
- 发布 workflow 支持从已验证构建产物执行纯发布，并在每次发布时创建或更新对应的 GitHub Release。
- Desktop 版本更新至 `0.1.47`。

## 验证

- Windows x64、macOS arm64、macOS x64 构建和真实安装包 Pi Task Runtime 校验通过。
- macOS 签名与公证校验通过。
- 七牛上传、CDN SHA-512 校验、更新元数据和网站发布服务通知成功。
