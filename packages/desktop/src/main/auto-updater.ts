import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { MessageBoxOptions } from 'electron';
import { IPC_CHANNELS } from './ipc-protocol';

export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  version?: string;
  releaseDate?: string;
  releaseName?: string;
  releaseNotes?: string | null | Array<{ note?: string; version?: string }>;
}

export interface UpdateProgress {
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export interface UpdateState {
  status: UpdateStatus;
  available: boolean;
  currentVersion: string;
  updateInfo?: UpdateInfo;
  progress?: UpdateProgress;
  error?: string;
  lastCheckedAt?: string;
}

interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}

interface UpdaterModule {
  autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    logger?: unknown;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    checkForUpdates: () => Promise<unknown>;
    downloadUpdate: () => Promise<unknown>;
    quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  };
}

interface LoggerModule {
  default?: unknown;
}

interface UpdateActionOptions {
  manual?: boolean;
}

function ok<T>(data: T): IpcResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function fail<T>(code: string, message: string): IpcResponse<T> {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  };
}

export class AutoUpdaterManager {
  constructor(
    private readonly prepareForInstall: () => Promise<void> = async () => {},
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  private mainWindow: BrowserWindow | null = null;
  private updater: UpdaterModule['autoUpdater'] | null = null;
  private isChecking = false;
  private installInProgress = false;
  private handlersRegistered = false;
  private lastCheckWasManual = false;
  private lastDownloadWasManual = false;
  private state: UpdateState = {
    status: app.isPackaged ? 'idle' : 'unsupported',
    available: false,
    currentVersion: app.getVersion(),
    ...(app.isPackaged ? {} : { error: '自动更新仅在已打包桌面应用中可用。' }),
  };

  async initialize(): Promise<void> {
    this.registerIpcHandlers();

    // Skip auto-updater in development or when not packaged
    if (!app.isPackaged) {
      console.log('[auto-updater] Skipping initialization in development mode');
      this.emitState();
      return;
    }

    const updaterModule = await this.loadOptionalModule<UpdaterModule>('electron-updater');
    if (!updaterModule?.autoUpdater) {
      console.warn('[auto-updater] electron-updater not installed, skipping initialization');
      this.setState({
        status: 'unsupported',
        available: false,
        error: 'electron-updater is not available in this runtime.',
      });
      return;
    }

    this.updater = updaterModule.autoUpdater;
    this.updater.autoDownload = false;
    // Windows NSIS starts before Electron exits. A normal quit can still be
    // stopping child processes when the old uninstaller tries to remove files.
    this.updater.autoInstallOnAppQuit = this.platform !== 'win32';

    const loggerModule = await this.loadOptionalModule<LoggerModule>('electron-log');
    if (loggerModule?.default) {
      this.updater.logger = loggerModule.default;
    }

    this.bindEvents();
    this.emitState();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  scheduleAutoCheck(delayMs = 30000): void {
    if (!app.isPackaged) {
      this.emitState();
      return;
    }

    setTimeout(() => {
      void this.checkForUpdates({ manual: false });
    }, delayMs).unref?.();
  }

  async checkForUpdates(options: UpdateActionOptions = {}): Promise<UpdateState> {
    if (!app.isPackaged) {
      return this.setState({
        status: 'unsupported',
        available: false,
        error: '自动更新仅在已打包桌面应用中可用。',
      });
    }

    if (!this.updater) {
      return this.setState({
        status: 'unsupported',
        available: false,
        error: '自动更新模块尚未初始化。',
      });
    }

    if (this.isChecking) {
      return this.getState();
    }

    this.isChecking = true;
    this.lastCheckWasManual = options.manual === true;
    this.setState({
      status: 'checking',
      available: false,
      error: undefined,
      progress: undefined,
      lastCheckedAt: new Date().toISOString(),
    });

    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check for updates';
      console.warn('[auto-updater] Check failed (this is expected if no publish config):', errorMessage);
      // Don't show error to user for missing publish config (404 errors)
      this.setState({
        status: 'not-available',
        available: false,
        error: undefined,
      });
    } finally {
      this.isChecking = false;
    }

    return this.getState();
  }

  async downloadUpdate(options: UpdateActionOptions = {}): Promise<UpdateState> {
    if (!this.updater) {
      return this.setState({
        status: 'unsupported',
        error: '自动更新模块尚未初始化。',
      });
    }

    if (!this.state.updateInfo) {
      return this.setState({
        status: 'error',
        error: '当前没有可下载的更新。',
      });
    }

    this.lastDownloadWasManual = options.manual === true;
    this.setState({
      status: 'downloading',
      error: undefined,
    });

    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      console.error('[auto-updater] Download failed:', error);
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to download update',
      });
    }

    return this.getState();
  }

  installDownloadedUpdate(): UpdateState {
    if (!this.updater || this.state.status !== 'downloaded') {
      return this.setState({
        status: 'error',
        error: '当前没有已下载的更新可安装。',
      });
    }

    if (this.installInProgress) return this.getState();
    this.installInProgress = true;

    setImmediate(() => {
      void (async () => {
        if (this.platform === 'win32') await this.prepareForInstall();
        this.updater?.quitAndInstall(false, true);
      })().catch((error: unknown) => {
        this.installInProgress = false;
        console.error('[auto-updater] Failed to prepare Windows update install', error);
        this.setState({ status: 'error', error: '更新安装前未能安全停止应用，请退出 OriginOS CE 后重试安装。' });
      });
    });

    return this.getState();
  }

  private registerIpcHandlers(): void {
    if (this.handlersRegistered) {
      return;
    }
    this.handlersRegistered = true;

    ipcMain.removeHandler(IPC_CHANNELS.UPDATE_STATUS);
    ipcMain.handle(IPC_CHANNELS.UPDATE_STATUS, async () => ok(this.getState()));

    ipcMain.removeHandler(IPC_CHANNELS.UPDATE_CHECK);
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => ok(await this.checkForUpdates({ manual: true })));

    ipcMain.removeHandler(IPC_CHANNELS.UPDATE_DOWNLOAD);
    ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => ok(await this.downloadUpdate({ manual: true })));

    ipcMain.removeHandler(IPC_CHANNELS.UPDATE_INSTALL);
    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
      const state = this.installDownloadedUpdate();
      if (state.status === 'error') {
        return fail<UpdateState>('UPDATE_NOT_READY', state.error ?? 'No downloaded update is ready to install.');
      }
      return ok(state);
    });
  }

  private bindEvents(): void {
    if (!this.updater) {
      return;
    }

    this.updater.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        error: undefined,
        lastCheckedAt: new Date().toISOString(),
      });
    });

    this.updater.on('update-available', (...args: unknown[]) => {
      const info = (args[0] ?? {}) as UpdateInfo;
      this.setState({
        status: 'available',
        available: true,
        updateInfo: info,
        progress: undefined,
        error: undefined,
      });

      if (!this.lastCheckWasManual) {
        void this.promptDownload(info);
      }
    });

    this.updater.on('update-not-available', (...args: unknown[]) => {
      const info = (args[0] ?? {}) as UpdateInfo;
      this.setState({
        status: 'not-available',
        available: false,
        updateInfo: info,
        progress: undefined,
        error: undefined,
      });
    });

    this.updater.on('download-progress', (progress: unknown) => {
      this.setState({
        status: 'downloading',
        progress: progress as UpdateProgress,
        error: undefined,
      });
    });

    this.updater.on('update-downloaded', (...args: unknown[]) => {
      const info = (args[0] ?? this.state.updateInfo ?? {}) as UpdateInfo;
      this.setState({
        status: 'downloaded',
        available: true,
        updateInfo: info,
        progress: undefined,
        error: undefined,
      });

      if (!this.lastDownloadWasManual) {
        void this.promptInstall(info);
      }
      this.lastDownloadWasManual = false;
    });

    this.updater.on('error', (error: unknown) => {
      this.installInProgress = false;
      console.error('[auto-updater] Runtime error:', error);
      this.setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Auto updater error',
      });
    });
  }

  private async promptDownload(info: UpdateInfo): Promise<void> {
    const options: MessageBoxOptions = {
      type: 'info',
      title: '发现新版本',
      message: `OriginOS CE ${info.version ?? ''} 可用`,
      detail: this.formatReleaseNotes(info) ?? '是否现在下载更新？',
      buttons: ['下载更新', '稍后提醒'],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = this.mainWindow && !this.mainWindow.isDestroyed()
      ? await dialog.showMessageBox(this.mainWindow, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      await this.downloadUpdate({ manual: false });
    }
  }

  private async promptInstall(info: UpdateInfo): Promise<void> {
    const options: MessageBoxOptions = {
      type: 'info',
      title: '更新已下载',
      message: `OriginOS CE ${info.version ?? ''} 已准备就绪`,
      detail: '是否立即重启安装更新？',
      buttons: ['立即重启', '稍后重启'],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = this.mainWindow && !this.mainWindow.isDestroyed()
      ? await dialog.showMessageBox(this.mainWindow, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      this.installDownloadedUpdate();
    }
  }

  private setState(patch: Partial<UpdateState>): UpdateState {
    this.state = {
      ...this.state,
      ...patch,
      currentVersion: app.getVersion(),
    };
    this.emitState();
    return this.getState();
  }

  private emitState(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.UPDATE_EVENT, this.getState());
      }
    }
  }

  private formatReleaseNotes(info: UpdateInfo): string | undefined {
    if (typeof info.releaseNotes === 'string') {
      return info.releaseNotes;
    }
    if (Array.isArray(info.releaseNotes)) {
      return info.releaseNotes
        .map((item) => item.note)
        .filter((note): note is string => Boolean(note))
        .join('\n\n');
    }
    return undefined;
  }

  private async loadOptionalModule<T>(specifier: string): Promise<T | null> {
    try {
      return (await import(specifier)) as T;
    } catch {
      return null;
    }
  }
}
