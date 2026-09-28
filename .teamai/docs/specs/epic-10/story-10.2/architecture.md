# 架构设计 - Story 10.2

**Story:** 原生窗体系统 — 多窗口管理
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| Electron BrowserWindow | 原生窗口管理 |
| IPC | 主进程与渲染进程通信 |
| React Hooks | Renderer 端封装 |

---

## 📝 实现任务

### 1. 实现 ElectronWindowManager（Main Process）

**文件:** `electron/window-manager.ts`

```typescript
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

interface WindowConfig {
  id: string;
  title: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  url?: string;
}

export class ElectronWindowManager {
  private windows = new Map<string, BrowserWindow>();
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.registerIpcHandlers();
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private registerIpcHandlers() {
    ipcMain.handle('window:create', (_event, config: WindowConfig) => {
      return this.createWindow(config);
    });

    ipcMain.handle('window:close', (_event, windowId: string) => {
      this.closeWindow(windowId);
    });

    ipcMain.handle('window:focus', (_event, windowId: string) => {
      this.focusWindow(windowId);
    });

    ipcMain.handle('window:minimize', (_event, windowId: string) => {
      this.minimizeWindow(windowId);
    });

    ipcMain.handle('window:maximize', (_event, windowId: string) => {
      this.maximizeWindow(windowId);
    });
  }

  createWindow(config: WindowConfig): string {
    const { width = 800, height = 600 } = config;

    // 居中显示
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const x = config.x ?? Math.round((screenWidth - width) / 2);
    const y = config.y ?? Math.round((screenHeight - height) / 2);

    const window = new BrowserWindow({
      width,
      height,
      x,
      y,
      title: config.title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // 加载内容
    if (config.url) {
      window.loadURL(config.url);
    } else if (process.env.NODE_ENV === 'development') {
      window.loadURL(`http://localhost:3000?windowId=${config.id}`);
    } else {
      window.loadFile(path.join(__dirname, '../out/index.html'), {
        query: { windowId: config.id },
      });
    }

    window.on('closed', () => {
      this.windows.delete(config.id);
      this.notifyMainWindow('window:closed', config.id);
    });

    this.windows.set(config.id, window);
    return config.id;
  }

  closeWindow(windowId: string) {
    const window = this.windows.get(windowId);
    if (window) {
      window.close();
    }
  }

  focusWindow(windowId: string) {
    const window = this.windows.get(windowId);
    if (window) {
      window.focus();
    }
  }

  minimizeWindow(windowId: string) {
    const window = this.windows.get(windowId);
    if (window) {
      window.minimize();
    }
  }

  maximizeWindow(windowId: string) {
    const window = this.windows.get(windowId);
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  }

  closeAllWindows() {
    this.windows.forEach((window) => window.close());
    this.windows.clear();
  }

  private notifyMainWindow(channel: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
```

### 2. 定义 IPC 协议

**文件:** `electron/ipc-protocol.ts`

```typescript
export const IPC_CHANNELS = {
  // 窗口管理
  WINDOW_CREATE: 'window:create',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSED: 'window:closed',

  // 文件系统
  FS_READ: 'fs:read',
  FS_WRITE: 'fs:write',
  FS_LIST: 'fs:list',
  FS_DELETE: 'fs:delete',
  FS_WATCH: 'fs:watch',

  // Agent
  AGENT_START: 'agent:start',
  AGENT_STOP: 'agent:stop',
  AGENT_MESSAGE: 'agent:message',
} as const;
```

### 3. 实现 useElectronWindow Hook（Renderer）

**文件:** `src/hooks/useElectronWindow.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { isElectron, getIpcRenderer } from '@/lib/integrations/electron/env';

interface ElectronWindowAPI {
  createWindow: (config: WindowConfig) => Promise<string>;
  closeWindow: (windowId: string) => Promise<void>;
  focusWindow: (windowId: string) => Promise<void>;
  minimizeWindow: (windowId: string) => Promise<void>;
  maximizeWindow: (windowId: string) => Promise<void>;
}

export function useElectronWindow(): ElectronWindowAPI | null {
  const [api, setApi] = useState<ElectronWindowAPI | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const ipcRenderer = getIpcRenderer();

    setApi({
      createWindow: (config) => ipcRenderer.invoke('window:create', config),
      closeWindow: (windowId) => ipcRenderer.invoke('window:close', windowId),
      focusWindow: (windowId) => ipcRenderer.invoke('window:focus', windowId),
      minimizeWindow: (windowId) => ipcRenderer.invoke('window:minimize', windowId),
      maximizeWindow: (windowId) => ipcRenderer.invoke('window:maximize', windowId),
    });
  }, []);

  return api;
}
```

### 4. 创建统一的 useAppWindow Hook

**文件:** `src/hooks/useAppWindowUnified.ts`

```typescript
import { useElectronWindow } from './useElectronWindow';
import { useAppWindowStore } from '@/store/appWindowStore';
import { isElectron } from '@/lib/integrations/electron/env';

/**
 * 统一的窗体 API，自动选择 Electron 原生窗体或浏览器模拟窗体
 */
export function useAppWindowUnified() {
  const electronWindow = useElectronWindow();
  const browserWindow = useAppWindowStore();

  if (isElectron() && electronWindow) {
    // Electron 环境：使用原生窗体
    return {
      openWindow: async (config: WindowConfig) => {
        return electronWindow.createWindow(config);
      },
      closeWindow: electronWindow.closeWindow,
      focusWindow: electronWindow.focusWindow,
      minimizeWindow: electronWindow.minimizeWindow,
      maximizeWindow: electronWindow.maximizeWindow,
    };
  }

  // 浏览器环境：使用 CSS 模拟窗体
  return {
    openWindow: async (config: WindowConfig) => {
      return browserWindow.openWindow(config);
    },
    closeWindow: async (windowId: string) => {
      browserWindow.closeWindow(windowId);
    },
    focusWindow: async (windowId: string) => {
      browserWindow.focusWindow(windowId);
    },
    minimizeWindow: async (windowId: string) => {
      browserWindow.minimizeWindow(windowId);
    },
    maximizeWindow: async (windowId: string) => {
      browserWindow.maximizeWindow(windowId);
    },
  };
}
```

### 5. 更新 AppWindowManager 使用统一 API

**文件:** `src/services/AppWindowManager.ts`

```typescript
import { isElectron } from '@/lib/integrations/electron/env';
import { useAppWindowStore } from '@/store/appWindowStore';

export class AppWindowManager {
  // ... 现有代码 ...

  openWindow(config: AppWindowConfig): string {
    if (isElectron()) {
      // Electron 环境：通过 IPC 创建原生窗口
      return this.openElectronWindow(config);
    }

    // 浏览器环境：使用现有的 CSS 模拟窗体
    return this.openBrowserWindow(config);
  }

  private openElectronWindow(config: AppWindowConfig): string {
    // 通过 IPC 调用 Main Process 创建窗口
    window.electron.ipcRenderer.invoke('window:create', {
      id: config.id,
      title: config.title,
      width: config.size?.width,
      height: config.size?.height,
    });
    return config.id;
  }

  private openBrowserWindow(config: AppWindowConfig): string {
    const store = useAppWindowStore.getState();
    return store.openWindow(config);
  }
}
```

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `electron/window-manager.ts` | 原生窗体管理器 |
| `electron/ipc-protocol.ts` | IPC 协议定义 |
| `src/hooks/useElectronWindow.ts` | Electron 窗体 Hook |
| `src/hooks/useAppWindowUnified.ts` | 统一窗体 API |
| `src/services/AppWindowManager.ts` | 现有窗体管理器（需适配） |
| `src/store/appWindowStore.ts` | 浏览器窗体状态管理 |

---

## 📚 相关文档

- [需求规格](./requirements.md) - 用户故事和验收标准
- [测试策略](./testing.md) - 测试用例和验证方法
- [返回 Story 概览](./README.md)
