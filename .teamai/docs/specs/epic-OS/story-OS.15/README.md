# Story OS.15: 桌面应用七牛 CDN 自动更新机制

**Epic:** OS — Phase 0 OS 交互基础
**状态:** 🚧 In Progress
**优先级:** High（影响已安装用户的版本分发、安全修复和体验连续性）
**估计工时:** 4-6 天
**依赖:** OS.9（应用窗口系统）、桌面打包链路、macOS 签名与公证账号、七牛对象存储空间与 CDN 域名

---

## 用户故事

> 作为已安装 OriginOS CE 桌面应用的用户，我希望应用能从企业可控的七牛 CDN 自动发现新版本、下载更新并在我确认后完成安装，这样我无需手动下载 DMG，也不依赖 GitHub Release 可用性。

---

## 背景与现状

当前桌面包已经具备部分自动更新基础设施：

- `packages/desktop/package.json` 已声明 `electron-updater`
- `packages/desktop/src/main/auto-updater.ts` 已实现基础 `AutoUpdaterManager`
- 本地打包命令 `pnpm desktop:dist` / `pnpm desktop:dist:mac` 可以生成 macOS arm64 / x64 DMG
- `packages/desktop/electron-builder.yml` 已生成 updater 所需的 `.blockmap` 和 sha512 元数据

当前缺口：

- 更新发布源需要从 GitHub Release 改为七牛 OSS/CDN
- `electron-builder.yml` 需要改为 `publish.provider = generic`，URL 指向七牛 CDN 更新目录
- 缺少上传七牛的发布脚本和 CI/本地发布流程
- 缺少发布后校验：七牛上必须存在 `latest-mac.yml`、DMG 和 blockmap
- 缺少端到端验证“旧版本安装后从七牛 CDN 自动更新到新版本”
- 正式更新仍需要 macOS Developer ID 签名与 notarization

---

## 目标架构

### 七牛 CDN 自动更新主链路

使用 `electron-builder + electron-updater + generic provider + 七牛 OSS/CDN`：

```text
开发者发布版本
  -> bump desktop app version
  -> pnpm desktop:dist
  -> 生成 DMG / blockmap / latest-mac.yml
  -> 发布脚本上传到七牛 OSS
  -> 七牛 CDN 对外提供静态更新目录

已安装客户端启动
  -> AutoUpdaterManager.checkForUpdates()
  -> electron-updater 读取 https://<cdn-domain>/<prefix>/latest-mac.yml
  -> 根据 latest-mac.yml 下载 DMG 与 blockmap
  -> 用户确认下载
  -> 下载完成后用户确认重启安装
```

### CDN 目录约定

第一阶段使用固定 channel 目录：

```text
https://<cdn-domain>/originos-ce/updates/stable/
├── latest-mac.yml
├── OriginOS CE-0.1.1-arm64.dmg
├── OriginOS CE-0.1.1-arm64.dmg.blockmap
├── OriginOS CE-0.1.1-x64.dmg
└── OriginOS CE-0.1.1-x64.dmg.blockmap
```

后续支持多渠道时扩展为：

```text
/originos-ce/updates/stable/latest-mac.yml
/originos-ce/updates/beta/latest-mac.yml
```

### electron-builder 配置方向

`packages/desktop/electron-builder.yml` 应配置：

```yaml
publish:
  provider: generic
  url: https://<cdn-domain>/originos-ce/updates/stable/
  channel: stable
```

要求：

- `url` 必须以 `/` 结尾，保证 `latest-mac.yml` 中的相对 `path` 能正确解析。
- 不再使用 `provider: github`，不依赖 GitHub Release。
- CDN 缓存策略必须保证 `latest-mac.yml` 可快速刷新，安装包可长缓存。

---

## 范围

### A. 发布产物与元数据（必须）

- [x] mac arm64 发布 `.dmg`
- [x] mac Intel x64 发布 `.dmg`
- [ ] 七牛 OSS/CDN 同步发布 `latest-mac.yml`
- [ ] 七牛 OSS/CDN 同步发布 arm64 / x64 `.dmg`
- [ ] 七牛 OSS/CDN 同步发布 `.blockmap`
- [x] `desktop:dist:qiniu` 每次发布默认自动 bump patch version，禁止同版本覆盖
- [ ] release notes 必须能被客户端展示
- [ ] 保留本地打包命令，不影响开发自测

### B. 七牛发布脚本与 CI（必须）

- [x] 新增 `desktop:dist:qiniu` 和 `desktop:publish:qiniu` 脚本
- [x] 新增七牛上传脚本 `packages/desktop/scripts/publish-qiniu-updates.js`
- [ ] CI 或本地发布环境注入 `QINIU_ACCESS_KEY`
- [ ] CI 或本地发布环境注入 `QINIU_SECRET_KEY`
- [ ] CI 或本地发布环境注入 `QINIU_BUCKET`
- [ ] CI 或本地发布环境注入 `QINIU_PREFIX`
- [ ] CI 或本地发布环境注入 `ORIGINOS_UPDATE_BASE_URL`
- [ ] 上传完成后校验 CDN URL 可访问
- [ ] 发布失败时不更新 `latest-mac.yml` 或能回滚到上一版本

### C. 客户端更新管理（必须）

- [x] `AutoUpdaterManager` 支持手动检查更新
- [x] 启动后延迟自动检查更新
- [x] 更新可用时提示用户下载
- [x] 下载过程上报进度
- [x] 下载完成后提示重启安装
- [x] 检查失败时不阻塞主应用启动
- [ ] 打包产物内 updater feed 指向七牛 CDN generic provider
- [ ] 设置页错误信息能区分“更新源不可达”和“已是最新”

### D. 产品 UI（必须）

- [x] 设置页展示当前版本
- [x] 设置页提供“检查更新”按钮
- [x] 展示更新状态：检查中 / 可下载 / 下载中 / 已下载 / 失败 / 已是最新
- [x] 展示下载进度
- [x] 提供“立即重启安装”按钮
- [x] 支持“稍后提醒”

### E. 安全与可信分发（必须）

- [ ] macOS 使用 Developer ID 签名
- [ ] macOS 完成 notarization
- [x] 客户端只接受 updater 元数据校验通过的包
- [x] 产物包含 sha512 元数据
- [ ] 七牛 bucket 写权限只允许发布凭据，不暴露到客户端
- [ ] 七牛 CDN 使用 HTTPS 自有域名
- [ ] 更新日志不得包含敏感凭证或内部路径

### F. 灰度与回滚（后续）

- [ ] 支持 stable / beta channel
- [ ] 支持按比例 rollout
- [ ] 支持坏版本拉黑
- [ ] 支持最低可用版本与强制升级策略
- [ ] 记录更新成功率和失败原因

---

## 非目标

- ❌ 不走 GitHub Release 作为自动更新源
- ❌ 第一阶段不自建动态更新服务
- ❌ 第一阶段不做强制静默安装
- ❌ 不改变用户数据目录结构
- ❌ 不把用户配置、项目数据或 Agent 记忆打包进更新包
- ❌ 不使用未签名产物作为正式更新源

---

## 验收标准

1. - [ ] 从 `0.1.x` 旧版本安装后，启动能检测到七牛 CDN 上的新版本
2. - [ ] 用户点击下载后能看到下载进度
3. - [ ] 下载完成后点击重启，应用升级到新版本
4. - [ ] 用户数据目录不被覆盖，项目、技能、Agent 数据仍可读取
5. - [ ] 无网络或七牛 CDN 不可达时，应用正常启动，只显示更新检查失败
6. - [ ] 七牛更新目录存在 arm64 / x64 `.dmg`、`.blockmap` 与 `latest-mac.yml`
7. - [ ] `latest-mac.yml` 中 `path`、`sha512`、`releaseDate` 与实际 CDN 产物一致
8. - [ ] macOS Gatekeeper 不阻止正式包启动和更新
9. - [ ] 设置页能显示当前版本和最近一次更新检查状态

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `packages/desktop/electron-builder.yml` | 将 publish 改为七牛 CDN 对应的 generic provider |
| MODIFY | `packages/desktop/package.json` | 新增七牛发布脚本与版本发布约束 |
| ADD | `packages/desktop/scripts/bump-release-version.js` | 发布前自动递增桌面包和根包版本 |
| MODIFY | `packages/desktop/src/main/auto-updater.ts` | 增强检查、下载、安装和状态上报 |
| MODIFY | `packages/desktop/src/main/main.ts` | 接入自动检查时机和 IPC |
| MODIFY | `packages/web/src/components/os/settings/SettingsDialog.tsx` | 增加更新 UI |
| ADD | `packages/desktop/scripts/publish-qiniu-updates.js` | 使用七牛 Node SDK 上传 DMG / blockmap / latest-mac.yml 到七牛 |
| ADD | 内部 CI 发布配置 | tag 或手动触发打包并发布到七牛，CI 平台按团队实际环境选择 |
| MODIFY | `docs/specs/epic-OS/story-OS.15/test-plan.md` | 七牛 CDN 自动更新测试计划 |

---

## 发布策略

### 版本规则

- 使用 semver：`major.minor.patch`
- patch：bug fix 和小 UI 修复
- minor：新增能力或兼容性变更
- major：可能需要数据迁移或破坏性行为变化
- `pnpm desktop:dist:qiniu` 默认执行 patch 自增，例如 `0.1.0 -> 0.1.1`
- 可通过 `RELEASE_VERSION=minor pnpm desktop:dist:qiniu` 发布 minor 版本
- 可通过 `RELEASE_VERSION=major pnpm desktop:dist:qiniu` 发布 major 版本
- 可通过 `RELEASE_VERSION=0.2.3 pnpm desktop:dist:qiniu` 指定显式版本
- 禁止覆盖七牛上已发布的同版本安装包

### 七牛缓存规则

- `latest-mac.yml`：短缓存或发布后主动刷新 CDN，建议 `Cache-Control: no-cache` 或低 TTL。
- `.dmg` / `.blockmap`：版本号文件名，允许长缓存。
- 上传顺序：先上传 DMG 和 blockmap，校验可访问后最后上传/刷新 `latest-mac.yml`。
- 回滚策略：恢复上一版本 `latest-mac.yml`，不删除历史安装包。

### 客户端默认策略

- 启动后延迟检查更新
- 默认不自动下载，先询问用户
- 下载完成后不强制重启
- 允许用户稍后安装

---

## 测试计划

### 本地验证

1. 构建 `0.1.0` 测试包并安装
2. 发布 `0.1.1` 到七牛测试 prefix，例如 `/originos-ce/updates/test/`
3. 启动 `0.1.0`，确认检测到 `0.1.1`
4. 点击下载并观察进度
5. 下载完成后重启安装
6. 验证 `app.getVersion()` 变为 `0.1.1`
7. 验证 `data/` 用户数据不丢失

### 失败场景

- 无网络
- 七牛 CDN 缺少 `latest-mac.yml`
- 七牛 CDN 中 DMG 或 blockmap 404
- 下载中断
- 签名/公证失败
- release version 小于或等于当前版本
- 用户选择稍后提醒

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| macOS 未签名或未公证 | 用户无法稳定安装/更新 | 发布流程必须接入 Developer ID 与 notarization |
| 同版本覆盖七牛产物 | 客户端不更新或校验失败 | 发布脚本检查目标 key 是否已存在 |
| `latest-mac.yml` 缺失 | electron-updater 无法发现更新 | 上传后自动校验 CDN URL |
| `latest-mac.yml` 缓存未刷新 | 用户长时间检测不到新版本 | 发布后刷新七牛 CDN 或设置低 TTL |
| 上传顺序错误 | 客户端读到新 yml 但包未上传完成 | 最后上传 `latest-mac.yml` |
| 更新包覆盖用户数据 | 严重数据事故 | 用户数据必须位于 app 外部 `userData/data` |
| 坏版本全量发布 | 大面积故障 | 保留上一版 yml，支持快速回滚 |

---

## 与其他 Story 的关系

- **OS.9 应用窗口系统**：更新提示和设置入口依赖桌面窗口与设置 UI
- **OS.14 工作目录与输出目录边界收敛**：更新包不得改变用户运行时数据目录语义
- **桌面打包链路**：本 Story 将本地 DMG 打包升级为可发布、可更新的七牛 CDN release 管线
