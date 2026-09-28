# 架构设计 - Story 10.6

**Story:** 自动更新与打包分发
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| electron-updater | 自动更新管理 |
| electron-builder | 多平台打包 |
| electron-log | 日志记录 |
| GitHub Releases | 更新服务器 |

---

## 📝 实现任务

### 1. 安装依赖

```bash
npm install electron-updater --save
```

### 2. 配置 electron-builder

**文件:** `electron-builder.yml`

```yaml
appId: com.originos.ce
productName: OriginOS CE
directories:
  output: release
  buildResources: resources

files:
  - out/**/*
  - electron/**/*
  - "!electron/**/*.ts"
  - "!**/*.map"

extraResources:
  - from: resources/icons
    to: resources/icons

mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  hardenedRuntime: true
  gatekeeperAssess: false

win:
  target:
    - target: nsis
      arch:
        - x64

linux:
  target:
    - target: AppImage
      arch:
        - x64
  category: Development

publish:
  provider: github
  owner: originos
  repo: originos-ce
  releaseType: release
```

### 3. 实现自动更新管理器

**文件:** `electron/auto-updater.ts`

```typescript
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import log from 'electron-log';

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

export class AutoUpdater {
  private mainWindow: BrowserWindow | null = null;
  private isChecking = false;

  constructor() {
    this.configureAutoUpdater();
  }

  private configureAutoUpdater() {
    // 配置日志
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // 绑定事件
    autoUpdater.on('checking-for-update', () => {
      this.sendStatusToRenderer('checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
      this.handleUpdateAvailable(info);
    });

    autoUpdater.on('update-not-available', () => {
      this.sendStatusToRenderer('update-not-available');
    });

    autoUpdater.on('error', (err) => {
      log.error('Auto updater error:', err);
      this.sendStatusToRenderer('error', { message: err.message });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendStatusToRenderer('download-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.handleUpdateDownloaded(info);
    });
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  async checkForUpdates() {
    if (this.isChecking) return;

    this.isChecking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('Check for updates failed:', err);
    } finally {
      this.isChecking = false;
    }
  }

  private async handleUpdateAvailable(info: UpdateInfo) {
    this.sendStatusToRenderer('update-available', info);

    // 显示更新对话框
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `OriginOS CE ${info.version} 现已可用`,
      detail: info.releaseNotes || '是否现在下载更新？',
      buttons: ['下载更新', '稍后提醒'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      // 用户确认下载
      autoUpdater.downloadUpdate();
    }
  }

  private async handleUpdateDownloaded(info: UpdateInfo) {
    this.sendStatusToRenderer('update-downloaded', info);

    // 显示安装对话框
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: '更新已下载',
      message: `OriginOS CE ${info.version} 已准备就绪`,
      detail: '更新将在应用重启后安装。是否现在重启？',
      buttons: ['立即重启', '稍后重启'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      // 立即安装并重启
      autoUpdater.quitAndInstall();
    }
  }

  private sendStatusToRenderer(status: string, data?: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, data });
    }
  }
}
```

### 4. 添加更新状态指示器（Renderer）

**文件:** `src/components/os/UpdateIndicator.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { isElectron, getIpcRenderer } from '@/lib/integrations/electron/env';

interface UpdateStatus {
  status: string;
  data?: {
    version?: string;
    percent?: number;
    message?: string;
  };
}

export function UpdateIndicator() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const ipcRenderer = getIpcRenderer();

    const handler = (_event: unknown, status: UpdateStatus) => {
      setUpdateStatus(status);
    };

    ipcRenderer.on('update-status', handler);

    return () => {
      ipcRenderer.removeListener('update-status', handler);
    };
  }, []);

  if (!updateStatus) return null;

  const { status, data } = updateStatus;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {status === 'download-progress' && data?.percent !== undefined && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 w-64">
          <div className="text-sm font-medium mb-2">正在下载更新...</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${data.percent}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {Math.round(data.percent)}%
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg shadow-lg p-4 w-64">
          <div className="text-sm font-medium text-red-600 dark:text-red-400">
            更新失败
          </div>
          <div className="text-xs text-red-500 mt-1">
            {data?.message || '请稍后重试'}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 5. 更新 package.json 脚本

```json
{
  "scripts": {
    "electron:dev": "concurrently \"next dev\" \"wait-on http://localhost:3000 && electron .\"",
    "electron:build": "next build && electron-builder --publish never",
    "electron:build:mac": "next build && electron-builder --mac --publish never",
    "electron:build:win": "next build && electron-builder --win --publish never",
    "electron:build:linux": "next build && electron-builder --linux --publish never",
    "electron:publish": "next build && electron-builder --publish always",
    "electron:pack": "electron-builder --dir"
  }
}
```

### 6. 初始化自动更新

**文件:** `electron/main.ts`

```typescript
import { app, BrowserWindow } from 'electron';
import { AutoUpdater } from './auto-updater';
import { TrayManager } from './tray-manager';
// ... 其他导入

let autoUpdater: AutoUpdater;

app.whenReady().then(() => {
  // ... 其他初始化

  // 初始化自动更新
  autoUpdater = new AutoUpdater();

  // 创建主窗口后设置引用
  const mainWindow = windowManager.getMainWindow();
  if (mainWindow) {
    autoUpdater.setMainWindow(mainWindow);

    // 应用启动后检查更新（延迟 5 秒，避免影响启动速度）
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 5000);
  }
});
```

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `electron-builder.yml` | 打包配置 |
| `electron/auto-updater.ts` | 自动更新管理器 |
| `src/components/os/UpdateIndicator.tsx` | 更新状态指示器 |
| `electron/main.ts` | 主进程入口（初始化） |
| `package.json` | 构建脚本 |
| `resources/icons/` | 应用图标 |

---

## 📚 相关文档

- [需求规格](./requirements.md) - 用户故事和验收标准
- [测试策略](./testing.md) - 测试用例和验证方法
- [返回 Story 概览](./README.md)
