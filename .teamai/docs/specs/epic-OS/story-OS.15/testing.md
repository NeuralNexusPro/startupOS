# Story OS.15 七牛 CDN 自动更新测试计划

## 目标

验证桌面应用能通过 `electron-builder + electron-updater + generic provider + 七牛 OSS/CDN` 完成发现更新、下载、重启安装，并且不会影响用户运行时数据。

## 本地预检

1. 执行 `pnpm --filter @originos/desktop build`，确认主进程和 preload 编译通过。
2. 执行 `pnpm --filter @originos/web type-check`，确认设置页和 core Electron service 类型通过。
3. 在开发环境打开设置页，确认更新区域显示“不可用”，且不会抛出 renderer 错误。
4. 执行 `pnpm desktop:dist`，确认本地生成 `OriginOS CE-<version>-arm64.dmg`、`OriginOS CE-<version>-x64.dmg` 和对应 `.blockmap`。
5. 确认 `latest-mac.yml` 生成，并包含 `version`、`files`、`path`、`sha512`、`releaseDate`。

## 七牛发布验证

1. 将 `packages/desktop/package.json` 版本提升到待发布 semver。
2. 或执行 `pnpm desktop:dist:qiniu` 自动 patch 自增版本；如需 minor/major/显式版本，设置 `RELEASE_VERSION=minor|major|x.y.z`。
3. 配置发布环境变量：`QINIU_ACCESS_KEY` / `QINIU_AK`、`QINIU_SECRET_KEY` / `QINIU_AS`、`QINIU_BUCKET`、`QINIU_PREFIX`、`ORIGINOS_UPDATE_BASE_URL`。变量可写在 shell 环境、`packages/desktop/.env.local`、`packages/desktop/.env`、根 `.env.local` 或根 `.env` 中，shell 环境优先。
4. 执行七牛发布脚本：`pnpm desktop:dist:qiniu`；如果已完成本地打包且只需重传元数据或当前版本产物，可只执行 `pnpm desktop:publish:qiniu`。
5. 确认脚本先上传 DMG 和 `.blockmap`，最后上传 `latest-mac.yml`。
6. 确认七牛 CDN URL 可访问 arm64 / x64 `.dmg`、`.blockmap` 与 `latest-mac.yml`。
7. 检查 `latest-mac.yml` 中的 `path` 能相对 `ORIGINOS_UPDATE_BASE_URL` 正确解析。
8. 发布后刷新七牛 CDN 中 `latest-mac.yml`，或确认其 TTL 足够短。
9. 重复发布同版本时应失败，避免覆盖已发布产物。

## 客户端升级验证

1. 安装旧版本 `0.1.x`。
2. 发布新版本 `0.1.y` 到七牛测试 prefix。
3. 启动旧版本，等待延迟自动检查。
4. 确认更新可用时弹出下载提示。
5. 选择“稍后提醒”，应用继续可用。
6. 打开设置页，点击“检查更新”，确认状态变为“可下载”。
7. 点击“下载更新”，确认下载进度持续更新。
8. 下载完成后点击“立即重启安装”。
9. 重启后确认 `app.getVersion()` 已变更为新版本。
10. 验证 `userData/data` 下项目、技能、Agent 运行时数据仍可读取。

## 失败场景

- 无网络：设置页显示失败状态，主应用继续启动。
- 七牛 CDN 缺少 `latest-mac.yml`：检查失败且不触发下载。
- 七牛 CDN 中 DMG 404：检查可成功但下载失败，可重新检查。
- 七牛 CDN 中 blockmap 404：下载降级或失败时应进入错误状态，不影响主应用。
- `latest-mac.yml` 被缓存为旧版本：客户端显示“已是最新”，发布流程应刷新 CDN。
- release version 小于或等于当前版本：显示“已是最新”。
- sha512 不匹配：electron-updater 拒绝安装。
- 签名或 notarization 失败：发布流程阻断正式上传。

## 验收输出

- 七牛 bucket / prefix
- 七牛 CDN 更新目录 URL
- 旧版本安装包、新版本安装包
- 设置页更新状态截图
- `latest-mac.yml` CDN URL 截图
- DMG / blockmap CDN URL 可访问截图
- 用户数据升级前后路径和文件数量对比
