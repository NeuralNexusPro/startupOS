# 架构设计 - Story 10.1

**Story:** Electron 基础框架搭建
**Epic:** Epic 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 🔧 技术实现要点

### 1. 安装依赖

```bash
npm install electron electron-builder --save-dev
npm install @electron/remote --save
```

### 2. Electron 主进程入口

**文件:** `electron/main.ts`

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 开发模式加载 localhost
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

### 3. Preload 脚本

**文件:** `electron/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, data: unknown) => {
      ipcRenderer.send(channel, data);
    },
    on: (channel: string, func: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => func(...args));
    },
    invoke: (channel: string, data: unknown) => {
      return ipcRenderer.invoke(channel, data);
    },
  },
  isElectron: true,
});
```

### 4. package.json 脚本配置

```json
{
  "scripts": {
    "electron:dev": "concurrently \"next dev\" \"wait-on http://localhost:3000 && electron .\"",
    "electron:build": "next build && next export && electron-builder",
    "electron:pack": "electron-builder --dir"
  },
  "main": "electron/main.ts",
  "build": {
    "appId": "com.originos.ce",
    "productName": "OriginOS CE",
    "directories": {
      "output": "release"
    },
    "files": [
      "out/**/*",
      "electron/**/*"
    ],
    "mac": {
      "target": "dmg"
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "AppImage"
    }
  }
}
```

### 5. TypeScript 配置

**文件:** `tsconfig.electron.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist-electron",
    "rootDir": "./electron",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["electron/**/*"],
  "exclude": ["node_modules", "dist", "out"]
}
```

### 6. 环境检测

**文件:** `src/lib/integrations/electron/env.ts`

```typescript
/**
 * 检测是否在 Electron 环境中运行
 */
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electron !== undefined;
};

/**
 * 获取 Electron IPC Renderer（仅在 Electron 环境中可用）
 */
export const getIpcRenderer = () => {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }
  return window.electron.ipcRenderer;
};
```
