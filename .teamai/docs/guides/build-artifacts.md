# 构建产物说明

## 目录结构

构建过程中会在根目录产生以下临时文件/目录：

### 1. `dist-electron/` - TypeScript 编译输出

**位置**：根目录 `/dist-electron/`

**来源**：
- `packages/desktop/tsconfig.json` 配置了 `"outDir": "../../dist-electron"`
- `packages/core/tsconfig.json` 配置了 `"outDir": "../../dist/core"`

**用途**：
- 存放编译后的 JavaScript 文件
- 打包时复制到 `packages/desktop/dist-electron/` 用于 electron-builder

**包含内容**：
```
dist-electron/
├── core/
│   └── src/          # Core 包编译输出
└── desktop/
    └── src/          # Desktop 包编译输出
```

**生命周期**：
- 每次运行 `pnpm build` 或打包命令时重新生成
- 可以安全删除（下次构建会重新生成）

### 2. `.tmp/` - Windows 打包临时文件

**位置**：根目录 `/.tmp/`

**来源**：
- electron-builder 在 macOS 上使用 Wine 构建 Windows 安装包

**包含内容**：
```
.tmp/
├── wine-prefix/     # Wine 环境配置
└── win-install/     # Windows 安装包构建临时文件
```

**生命周期**：
- 只在打包 Windows 版本时创建
- 打包完成后可以安全删除

### 3. `release/` - 打包输出

**位置**：根目录 `/release/`

**来源**：
- electron-builder 打包输出

**包含内容**：
```
release/
├── mac-arm64/                    # macOS ARM64 应用
├── mac/                          # macOS x64 应用
├── win-unpacked/                 # Windows 解压版
├── *.dmg                         # macOS 安装镜像
├── *.exe                         # Windows 安装包
├── *.zip                         # 压缩包
├── *.blockmap                    # 增量更新文件
├── stable-mac.yml                # macOS 更新元数据
└── latest-mac.yml                # 最新版本元数据
```

**生命周期**：
- 每次打包时重新生成
- 发布后可以删除（已上传到 CDN）

## 清理命令

### 快速清理

```bash
# 清理构建临时文件
pnpm clean

# 清理所有构建产物（包括 release）
pnpm clean:all
```

### 手动清理

```bash
# 只清理 TypeScript 编译输出
rm -rf dist-electron dist

# 清理 Windows 打包临时文件
rm -rf .tmp

# 清理打包输出
rm -rf release

# 清理所有（谨慎使用）
rm -rf dist-electron dist .tmp release packages/desktop/dist-electron packages/web/.next
```

## .gitignore 配置

以下构建产物已在 `.gitignore` 中排除，不会被提交到 Git：

```gitignore
/dist-electron      # TypeScript 编译输出
/.tmp               # Windows 打包临时文件
/release            # 打包输出
/dist-*             # 所有 dist 目录
```

## 构建流程

### 完整构建流程

```bash
# 1. 清理旧产物
pnpm clean

# 2. 构建并打包 macOS
pnpm desktop:dist:mac:arm64

# 3. 构建并打包 Windows
pnpm desktop:dist:win

# 4. 发布到 CDN
pnpm desktop:publish:qiniu
```

### 增量构建

如果只需要重新打包（不重新编译 TypeScript）：

```bash
# 直接打包（使用已有的 dist-electron）
cd packages/desktop
pnpm dist:mac:arm64
```

## 常见问题

### Q: 为什么 dist-electron 在根目录而不是 packages/desktop/？

A: 这是 monorepo 架构的设计。core 和 desktop 的代码都需要编译，编译输出统一放在根目录的 `dist-electron/`，打包时再复制到 `packages/desktop/dist-electron/`。

### Q: 可以修改输出目录吗？

A: 可以，但需要修改：
1. `packages/desktop/tsconfig.json` 的 `outDir`
2. `packages/core/tsconfig.json` 的 `outDir`
3. `packages/desktop/package.json` 的 `build:app` 脚本中的复制逻辑

**不推荐修改**，因为当前配置是经过优化的，避免了重复编译。

### Q: .tmp 目录占用空间很大怎么办？

A: `.tmp` 只在打包 Windows 时创建。如果不需要打包 Windows，可以：
1. 删除 `.tmp`：`rm -rf .tmp`
2. 只打包 macOS：`pnpm desktop:dist:mac`

### Q: 如何在 CI/CD 中自动清理？

A: 在 CI 脚本中添加清理步骤：

```yaml
# GitHub Actions 示例
- name: Clean build artifacts
  run: pnpm clean

- name: Build
  run: pnpm desktop:dist:mac:arm64

- name: Upload artifacts
  uses: actions/upload-artifact@v3
  with:
    name: mac-build
    path: release/*.dmg
```

## 最佳实践

1. **开发时**：不清理 `dist-electron`，避免重复编译
2. **打包前**：运行 `pnpm clean` 确保干净构建
3. **发布后**：运行 `pnpm clean:all` 释放磁盘空间
4. **Git 提交前**：确认 `.gitignore` 包含所有构建产物

## 相关文件

- `packages/desktop/tsconfig.json` - Desktop TypeScript 配置
- `packages/core/tsconfig.json` - Core TypeScript 配置
- `packages/desktop/package.json` - 构建脚本
- `.gitignore` - Git 忽略规则
