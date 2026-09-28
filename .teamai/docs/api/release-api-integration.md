# 官网发布服务集成指南

## 概述

发布脚本现在支持在发布成功后自动调用官网发布服务API，更新版本下载地址和版本号，用于官网投放。

## 配置步骤

### 1. 添加环境变量

在项目根目录的 `.env` 文件中添加以下配置：

```bash
# 官网发布服务配置
ORIGINOS_RELEASE_API_URL=https://wolfgaze.cn/api/originos-release
ORIGINOS_RELEASE_API_KEY=your_api_key_here
```

或者在 `packages/desktop/.env.local` 中添加（仅影响桌面发布）。

### 2. API 接口说明

**接口地址**: `POST /api/originos-release`

**注意**: API 路径根据你的网站配置可能是：
- `https://wolfgaze.cn/api/originos-release`（无前缀）
- `https://wolfgaze.cn/originos/api/originos-release`（有 `/originos` 前缀）

请根据实际情况配置 `ORIGINOS_RELEASE_API_URL`

**请求头**:
- `Content-Type: application/json`
- `x-api-key: YOUR_API_KEY`

**请求体示例**:
```json
{
  "version": "0.1.12",
  "win_x64_url": "https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-0.1.12-x64.exe",
  "mac_arm64_url": "https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-0.1.12-arm64.dmg",
  "mac_x64_url": "https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-0.1.12-x64.dmg"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "Version updated successfully",
  "data": {
    "version": "0.1.12",
    "updated_at": "2026-07-14T00:30:00.000Z"
  }
}
```

## 发布流程

### 完整发布流程（推荐）

```bash
# 1. 配置环境变量（确保已配置 QINIU 和 ORIGINOS_RELEASE 相关变量）

# 2. 构建所有平台
pnpm desktop:build

# 3. 发布到 CDN 并通知官网
pnpm desktop:publish:qiniu
```

### 仅发布到 CDN（不通知官网）

如果不配置 `ORIGINOS_RELEASE_API_URL`，脚本会跳过官网通知，仅发布到七牛 CDN。

```bash
pnpm desktop:publish:qiniu
```

### 手动通知官网

如果需要手动通知官网更新版本：

```bash
curl -X POST https://wolfgaze.cn/api/originos-release \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "version": "0.1.11",
    "win_x64_url": "https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-0.1.11-x64.exe",
    "mac_arm64_url": "https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-0.1.11-arm64.dmg",
    "mac_x64_url": "https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-0.1.11-x64.dmg"
  }'
```

## 脚本行为

### 成功场景
- ✅ 发布文件到七牛 CDN
- ✅ 验证 CDN 文件可访问
- ✅ 调用官网 API 更新版本信息
- ✅ 打印成功日志

### 失败场景
- ❌ 七牛发布失败 → 整个流程失败，不通知官网
- ❌ CDN 验证失败 → 整个流程失败
- ⚠️ 官网 API 调用失败 → 打印警告，但发布流程成功（不影响 CDN发布）

### 跳过通知场景
- ℹ️ 未配置 `ORIGINOS_RELEASE_API_URL` → 跳过通知，仅发布到 CDN
- ℹ️ 未配置 `ORIGINOS_RELEASE_API_KEY` → 跳过通知，打印警告

## 下载地址格式

脚本会自动生成以下格式的下载地址：

- **Windows**: `https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-{version}-x64.exe`
- **macOS ARM64**: `https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-{version}-arm64.dmg`
- **macOS x64**: `https://cdn.artseeu.cn/originos-ce/updates/stable/OriginOS%20CE-{version}-x64.dmg`

其中 `{version}` 会被替换为 `package.json` 中的版本号。

## 故障排查

### 1. 检查环境变量
```bash
echo $ORIGINOS_RELEASE_API_URL
echo $ORIGINOS_RELEASE_API_KEY
```

### 2. 测试 API 连接
```bash
curl -X POST https://wolfgaze.cn/api/originos-release \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"version":"0.0.0","win_x64_url":"test","mac_arm64_url":"test","mac_x64_url":"test"}'
```

### 3. 查看详细日志
发布脚本会打印详细的日志，包括：
- `[publish-qiniu-updates] notifying release service` - 开始通知
- `[publish-qiniu-updates] release service notified successfully` - 通知成功
- `[publish-qiniu-updates] failed to notify release service:` - 通知失败（含错误信息）

## 安全注意事项

- ⚠️ 不要将 `ORIGINOS_RELEASE_API_KEY` 提交到版本控制
- ⚠️ 在 CI/CD 环境中使用 secrets 管理环境变量
- ✅ API 密钥仅用于发布时的版本通知，不影响 CDN 访问
