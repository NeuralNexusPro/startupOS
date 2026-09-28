# 架构设计 - Story 10.3

**Story:** 本地文件系统直连
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-02

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| Node.js fs/promises | 文件系统操作 |
| chokidar | 文件变化监听 |
| IPC | 主进程与渲染进程通信 |
| React Hooks | Renderer 端封装 |

---

## 📝 实现任务

### 1. 实现 LocalFileSystem（Main Process）

**文件:** `electron/local-fs.ts`

```typescript
import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';

export class LocalFileSystem {
  private dataDir: string;
  private watchers = new Map<string, chokidar.FSWatcher>();

  constructor(dataDir: string = path.join(process.env.HOME || '', 'OriginOS', 'data')) {
    this.dataDir = dataDir;
    this.registerIpcHandlers();
  }

  private registerIpcHandlers() {
    ipcMain.handle('fs:read', async (_event, filePath: string) => {
      return this.readFile(filePath);
    });

    ipcMain.handle('fs:write', async (_event, filePath: string, content: string) => {
      return this.writeFile(filePath, content);
    });

    ipcMain.handle('fs:list', async (_event, dirPath: string) => {
      return this.listFiles(dirPath);
    });

    ipcMain.handle('fs:delete', async (_event, filePath: string) => {
      return this.deleteFile(filePath);
    });

    ipcMain.handle('fs:watch', async (_event, filePath: string) => {
      return this.watchFile(filePath);
    });
  }

  private resolvePath(filePath: string): string {
    // 安全检查：防止路径遍历
    const resolved = path.resolve(this.dataDir, filePath);
    if (!resolved.startsWith(this.dataDir)) {
      throw new Error('Access denied: path outside data directory');
    }
    return resolved;
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const fullPath = this.resolvePath(dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    return Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(fullPath, entry.name);
        const stats = await fs.stat(entryPath);

        return {
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.unlink(fullPath);
  }

  watchFile(filePath: string): () => void {
    const fullPath = this.resolvePath(filePath);

    if (this.watchers.has(fullPath)) {
      return () => this.unwatchFile(fullPath);
    }

    const watcher = chokidar.watch(fullPath, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', (changedPath) => {
      // 通知 Renderer 进程
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('fs:changed', {
          path: path.relative(this.dataDir, changedPath),
          type: 'change',
        });
      });
    });

    this.watchers.set(fullPath, watcher);
    return () => this.unwatchFile(fullPath);
  }

  private unwatchFile(filePath: string) {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
  }
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}
```

### 2. 实现 useLocalFS Hook（Renderer）

**文件:** `src/hooks/useLocalFS.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { isElectron, getIpcRenderer } from '@/lib/integrations/electron/env';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export function useLocalFS() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isElectron()) {
      setIsReady(true);
    }
  }, []);

  const readFile = useCallback(async (filePath: string): Promise<string> => {
    if (!isElectron()) {
      throw new Error('useLocalFS is only available in Electron');
    }
    return getIpcRenderer().invoke('fs:read', filePath);
  }, []);

  const writeFile = useCallback(async (filePath: string, content: string): Promise<void> => {
    if (!isElectron()) {
      throw new Error('useLocalFS is only available in Electron');
    }
    return getIpcRenderer().invoke('fs:write', filePath, content);
  }, []);

  const listFiles = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    if (!isElectron()) {
      throw new Error('useLocalFS is only available in Electron');
    }
    return getIpcRenderer().invoke('fs:list', dirPath);
  }, []);

  const deleteFile = useCallback(async (filePath: string): Promise<void> => {
    if (!isElectron()) {
      throw new Error('useLocalFS is only available in Electron');
    }
    return getIpcRenderer().invoke('fs:delete', filePath);
  }, []);

  const watchFile = useCallback((filePath: string, onChange: (path: string) => void) => {
    if (!isElectron()) {
      throw new Error('useLocalFS is only available in Electron');
    }

    const ipcRenderer = getIpcRenderer();

    // 开始监听
    ipcRenderer.invoke('fs:watch', filePath);

    // 监听变化事件
    const handler = (_event: unknown, data: { path: string; type: string }) => {
      onChange(data.path);
    };

    ipcRenderer.on('fs:changed', handler);

    // 返回清理函数
    return () => {
      ipcRenderer.removeListener('fs:changed', handler);
    };
  }, []);

  return {
    isReady,
    readFile,
    writeFile,
    listFiles,
    deleteFile,
    watchFile,
  };
}
```

### 3. 创建统一的 useFileSystem Hook

**文件:** `src/hooks/useFileSystemUnified.ts`

```typescript
import { useLocalFS } from './useLocalFS';
import { useRemoteFS } from './useRemoteFS';
import { isElectron } from '@/lib/integrations/electron/env';

/**
 * 统一的文件系统 API，自动选择本地直连或 HTTP API
 */
export function useFileSystemUnified() {
  const localFS = useLocalFS();
  const remoteFS = useRemoteFS();

  if (isElectron() && localFS.isReady) {
    // Electron 环境：本地直连
    return {
      readFile: localFS.readFile,
      writeFile: localFS.writeFile,
      listFiles: localFS.listFiles,
      deleteFile: localFS.deleteFile,
      watchFile: localFS.watchFile,
    };
  }

  // 浏览器环境：HTTP API
  return {
    readFile: remoteFS.readFile,
    writeFile: remoteFS.writeFile,
    listFiles: remoteFS.listFiles,
    deleteFile: remoteFS.deleteFile,
    watchFile: remoteFS.watchFile,
  };
}
```

### 4. 初始化 LocalFileSystem

**文件:** `electron/main.ts`

```typescript
import { app } from 'electron';
import { LocalFileSystem } from './local-fs';
import { ElectronWindowManager } from './window-manager';

let localFS: LocalFileSystem;
let windowManager: ElectronWindowManager;

app.whenReady().then(() => {
  // 初始化文件系统
  localFS = new LocalFileSystem();

  // 初始化窗口管理器
  windowManager = new ElectronWindowManager();

  // 创建主窗口
  // ...
});
```

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `electron/local-fs.ts` | 本地文件系统适配器 |
| `src/hooks/useLocalFS.ts` | 本地文件系统 Hook |
| `src/hooks/useFileSystemUnified.ts` | 统一文件系统 API |
| `electron/main.ts` | 主进程入口（初始化） |

---

## 📚 相关文档

- [需求规格](./requirements.md) - 用户故事和验收标准
- [测试策略](./testing.md) - 测试用例和验证方法
- [返回 Story 概览](./README.md)
