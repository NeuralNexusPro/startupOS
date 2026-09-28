# OriginOS CE v0.1.20 Changelog

## 2026-07-24 — fix：修复角色窗体附件按钮

**类型**：fix
**影响模块**：`packages/web/src/components/ui/chat-input-bar.tsx`
**摘要**：角色 Agent 窗体在 running/thinking 状态下会禁用消息输入，之前附件按钮复用了该禁用状态，导致 Windows 版本中创建出来的角色点击附件按钮没有反应。现在附件按钮只在上传进行中禁用，可以正常打开文件选择器。

## 同步包含

- Windows 安装态内置 skill bundled fallback 修复。
- Windows 自动更新 metadata sha512 校验修复。

## 验证

- `pnpm --filter @originos/web test -- src/components/ui/__tests__/chat-input-bar.test.tsx`
- `pnpm --filter @originos/web type-check`
- `pnpm --filter @originos/web exec eslint src/components/ui/chat-input-bar.tsx src/components/ui/__tests__/chat-input-bar.test.tsx`
