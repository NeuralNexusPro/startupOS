# ONT.8 平台矩阵

**执行日期：** 2026-09-25  
**分支：** `0.4.x`

| 平台 | Module resolution | Preload / IPC | 强退恢复 smoke | 状态 |
|---|---|---|---|---|
| Electron development | `verify:ontology-runtime` | 精确 channel 与 Desktop adapter 已验证 | 临时 ledger 重建后 paused 不自启、cancelled 不复活 | Passed |
| macOS arm64 package | `release/mac-arm64/.../app.asar` 内 ONT service/recovery/ledger 可解析 | package 内 IPC protocol 与 adapter 可解析 | 从 package 提取的 runtime 执行文件持久化恢复 smoke | Passed（本地 unsigned smoke） |
| macOS x64 package | `release/mac/.../app.asar` 内 ONT service/recovery/ledger 可解析 | package 内 IPC protocol 与 adapter 可解析 | 从 package 提取的 runtime 执行文件持久化恢复 smoke | Passed（本地 unsigned smoke） |
| Windows x64 package | `verify-windows-package.js` 已加入相同 ONT 检查 | 已加入 | `verify-ontology-runtime.js <asar>` 可执行相同恢复 smoke | Pending：等待 Windows runner 实际构建 |

## 命令

```bash
pnpm --filter @originos/desktop build
pnpm --filter @originos/desktop verify:ontology-runtime
node packages/desktop/scripts/verify-ontology-runtime.js 'release/mac-arm64/OriginOS CE.app/Contents/Resources/app.asar'
node packages/desktop/scripts/verify-ontology-runtime.js 'release/mac/OriginOS CE.app/Contents/Resources/app.asar'
```

macOS 本地目录包不做签名与 notarization；这里只验证 ONT 模块解析、IPC 接线和进程恢复。正式签名仍由 release workflow 负责。Windows 未在对应 runner 执行，因此 ONT8-T1-J 与 Story 保持未完成。
