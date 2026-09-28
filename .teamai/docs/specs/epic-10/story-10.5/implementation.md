# 实施文档 - Story 10.5

**Story:** 系统托盘与全局快捷键
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 开发步骤

### 1. 实现系统托盘管理器

**文件:** `electron/tray-manager.ts`

```typescript
import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'path';

interface RecentProject {
  id: string;
  name: string;
  lastOpened: string;
}

export class TrayManager {
  private tray: Tray | null = null;
  private recentProjects: RecentProject[] = [];

  constructor() {
    this.createTray();
  }

  private createTray() {
    const iconPath = this.getIconPath();
    const icon = nativeImage.createFromPath(iconPath);

    // macOS 需要设置为模板图像以支持暗色模式
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('OriginOS CE');

    // 点击托盘图标显示主窗口（macOS）
    this.tray.on('click', () => {
      this.showMainWindow();
    });

    this.updateContextMenu();
  }

  private getIconPath(): string {
    // 开发模式使用源码目录，生产模式使用打包后的资源
    if (process.env.NODE_ENV === 'development') {
      return path.join(__dirname, '../resources/icons/tray-icon.png');
    }
    return path.join(process.resourcesPath, 'resources/icons/tray-icon.png');
  }

  private updateContextMenu() {
    const recentProjectsMenu = this.recentProjects.map((project) => ({
      label: project.name,
      click: () => this.openProject(project.id),
    }));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开 OriginOS',
        click: () => this.showMainWindow(),
      },
      { type: 'separator' },
      {
        label: '最近项目',
        submenu: recentProjectsMenu.length > 0
          ? recentProjectsMenu
          : [{ label: '无最近项目', enabled: false }],
      },
      { type: 'separator' },
      {
        label: '快速启动',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => this.showQuickLauncher(),
      },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
          });
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray?.setContextMenu(contextMenu);
  }

  private showMainWindow() {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find((w) => w.getTitle() === 'OriginOS CE');

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      // 如果主窗口不存在，触发创建
      const { ipcMain } = require('electron');
      ipcMain.emit('tray:show-main-window');
    }
  }

  private showQuickLauncher() {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find((w) => w.getTitle() === 'OriginOS CE');

    if (mainWindow) {
      mainWindow.webContents.send('show-quick-launcher');
      mainWindow.show();
      mainWindow.focus();
    }
  }

  private openProject(projectId: string) {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find((w) => w.getTitle() === 'OriginOS CE');

    if (mainWindow) {
      mainWindow.webContents.send('open-project', projectId);
      mainWindow.show();
      mainWindow.focus();
    }
  }

  updateRecentProjects(projects: RecentProject[]) {
    this.recentProjects = projects;
    this.updateContextMenu();
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
```

### 2. 注册全局快捷键

**文件:** `electron/shortcuts.ts`

```typescript
import { globalShortcut, BrowserWindow, app } from 'electron';

interface ShortcutConfig {
  accelerator: string;
  action: string;
}

export class ShortcutManager {
  private shortcuts: Map<string, ShortcutConfig> = new Map();

  constructor() {
    this.registerDefaultShortcuts();
  }

  private registerDefaultShortcuts() {
    // 快速启动
    this.register({
      accelerator: 'CmdOrCtrl+Shift+O',
      action: 'quick-launcher',
    });

    // 新建 Agent 会话
    this.register({
      accelerator: 'CmdOrCtrl+Shift+N',
      action: 'new-agent-session',
    });

    // 切换窗口
    this.register({
      accelerator: 'CmdOrCtrl+Shift+W',
      action: 'switch-window',
    });
  }

  register(config: ShortcutConfig): boolean {
    const success = globalShortcut.register(config.accelerator, () => {
      this.handleShortcut(config.action);
    });

    if (success) {
      this.shortcuts.set(config.action, config);
    }

    return success;
  }

  unregister(action: string) {
    const config = this.shortcuts.get(action);
    if (config) {
      globalShortcut.unregister(config.accelerator);
      this.shortcuts.delete(action);
    }
  }

  private handleShortcut(action: string) {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find((w) => w.getTitle() === 'OriginOS CE');

    if (!mainWindow) return;

    switch (action) {
      case 'quick-launcher':
        mainWindow.webContents.send('show-quick-launcher');
        mainWindow.show();
        mainWindow.focus();
        break;

      case 'new-agent-session':
        mainWindow.webContents.send('new-agent-session');
        mainWindow.show();
        mainWindow.focus();
        break;

      case 'switch-window':
        mainWindow.webContents.send('switch-window');
        mainWindow.show();
        mainWindow.focus();
        break;
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
    this.shortcuts.clear();
  }
}
```

### 3. 更新主进程初始化

**文件:** `electron/main.ts`

```typescript
import { app } from 'electron';
import { LocalFileSystem } from './local-fs';
import { LocalAgentBridge } from './local-agent-bridge';
import { ElectronWindowManager } from './window-manager';
import { TrayManager } from './tray-manager';
import { ShortcutManager } from './shortcuts';

let localFS: LocalFileSystem;
let agentBridge: LocalAgentBridge;
let windowManager: ElectronWindowManager;
let trayManager: TrayManager;
let shortcutManager: ShortcutManager;

app.whenReady().then(() => {
  // 初始化文件系统
  localFS = new LocalFileSystem();

  // 初始化 Agent 桥接
  agentBridge = new LocalAgentBridge();

  // 初始化窗口管理器
  windowManager = new ElectronWindowManager();

  // 初始化系统托盘
  trayManager = new TrayManager();

  // 初始化全局快捷键
  shortcutManager = new ShortcutManager();

  // 创建主窗口
  // ...
});

app.on('before-quit', async () => {
  // 清理资源
  shortcutManager.unregisterAll();
  trayManager.destroy();
  await agentBridge.shutdown();
});

app.on('window-all-closed', () => {
  // macOS 不在关闭所有窗口时退出
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### 4. 监听快速启动事件（Renderer）

**文件:** `src/components/os/QuickLauncher.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { isElectron, getIpcRenderer } from '@/lib/integrations/electron/env';

export function QuickLauncher() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isElectron()) return;

    const ipcRenderer = getIpcRenderer();

    const handler = () => {
      setIsOpen(true);
    };

    ipcRenderer.on('show-quick-launcher', handler);

    return () => {
      ipcRenderer.removeListener('show-quick-launcher', handler);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[20vh]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] p-4">
        <input
          autoFocus
          className="w-full px-4 py-3 text-lg border rounded-lg"
          placeholder="搜索项目、Agent 或技能..."
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        />
        {/* 搜索结果列表 */}
      </div>
    </div>
  );
}
```
