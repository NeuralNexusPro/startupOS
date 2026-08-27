import './setup-data-root';
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { mkdirSync } from 'node:fs';
import { ElectronWindowManager } from './window-manager';
import { LocalFileSystem } from './local-fs';
import { LocalAgentBridge } from './local-agent-bridge';
import { TrayManager } from './tray-manager';
import { ShortcutManager } from './shortcuts';
import { AutoUpdaterManager } from './auto-updater';
import { SkillService } from './services/skill-service';
import { ProjectService } from './services/project-service';
import { OntologyService } from './services/ontology-service';
import { UserRegistryService } from './services/user-registry-service';
import { MiscService } from './services/misc-service';
import { OntologyDataService } from './services/ontology-data-service';
import { CollaborationService } from './services/collaboration-service';
import { AgentSessionService } from './services/agent-session-service';
import { AgentProjectService } from './services/agent-project-service';
import { WorkspaceService } from './services/workspace-service';
import { EntryExportService } from './services/entry-export-service';
import { DesktopSchedulerService } from './services/desktop-scheduler-service';
import { BufferedDailyLogWriter } from './services/daily-log-writer';
import { captureConsoleCall, serializeConsoleArgs } from './services/console-log-capture';
import { processHealthMonitor } from './services/process-health-monitor';
import { attachDevToolsContextMenu } from './devtools-context-menu';
import { agentManager } from '../../../core/src/lib/integrations/pi-agent/agent-manager';
import { persistentAgentManager } from '../../../core/src/lib/integrations/pi-agent/persistent-agent-manager';
import { shutdownGlobalSpawner } from '../../../core/src/modules/collaboration-runtime/sandbox/agent-spawner';

if (process.platform === 'darwin' && process.arch === 'x64') {
  app.commandLine.appendSwitch('use-angle', 'gl');
}

app.setName('OriginOS CE');
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'OriginOS CE Dev'));
}
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}
if (process.platform === 'win32') {
  app.setAppUserModelId('com.originos.ce');
}

let mainWindow: BrowserWindow | null = null;
let windowManager: ElectronWindowManager | null = null;
let localFileSystem: LocalFileSystem | null = null;
let localAgentBridge: LocalAgentBridge | null = null;
let trayManager: TrayManager | null = null;
let shortcutManager: ShortcutManager | null = null;
let autoUpdaterManager: AutoUpdaterManager | null = null;
let desktopSchedulerService: DesktopSchedulerService | null = null;
let rendererServerProcess: ChildProcess | null = null;
let packagedRendererUrlPromise: Promise<string> | null = null;
const ipcServices: unknown[] = [];
let llmLogCaptureInitialized = false;
let desktopLogCaptureInitialized = false;
let dailyLogWriter: BufferedDailyLogWriter | null = null;
let shutdownInProgress = false;
let allowQuitAfterShutdown = false;

const llmLogPrefixes = [
  '[LLM',
  '[createRuntimeModel]',
  '[createOriginOSAgent]',
  '[OriginOSAgent]',
  '[streamFn]',
  '[anthropic stream]',
  '[AgentLoop]',
  '[renderer]',
  '[IPC]',
  '[AgentSessionService]',
  '[AgentManager]',
  '[WorkspaceService]',
  '[EntryExportService]',
  '[MiscService]',
  '[SkillService]',
  '[SkillLauncher]',
  '[ProjectService]',
  '[OntologyService]',
  '[OntologyDataService]',
  '[CollaborationService]',
  '[AgentProjectService]',
  '[DesktopSchedulerService]',
  '[PersistentAgent]',
  '[setup-data-root]',
  '[LocalFS]',
  '[MultiAgentRuntime]',
  '[ProcessHealth]',
];

function shouldWriteLlmLog(line: string): boolean {
  return llmLogPrefixes.some((prefix) => line.includes(prefix));
}

function appendDesktopLog(line: string): void {
  if (!dailyLogWriter) {
    return;
  }
  dailyLogWriter.append('desktop', `[${new Date().toISOString()}] ${line}\n`);
}

function getDailyLogWriter(): BufferedDailyLogWriter {
  dailyLogWriter ??= new BufferedDailyLogWriter({
    logsDir: app.getPath('logs'),
    flushDelayMs: 1000,
    maxBytes: 256 * 1024,
  });
  return dailyLogWriter;
}

function initializeDesktopLogCapture(): void {
  if (desktopLogCaptureInitialized) {
    return;
  }
  desktopLogCaptureInitialized = true;

  const logWriter = getDailyLogWriter();

  for (const methodName of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[methodName].bind(console);
    console[methodName] = (...args: unknown[]) => {
      captureConsoleCall({
        methodName,
        args,
        llmEnabled: llmLogCaptureInitialized,
        shouldWriteLlm: shouldWriteLlmLog,
        appendDesktop: appendDesktopLog,
        appendLlm: line => {
          const timestamp = new Date().toISOString();
          logWriter.append('llm', `[${timestamp}] ${line}\n`);
        },
        writeTerminal: line => original(line),
      });
    };
  }

  process.on('uncaughtException', (error) => {
    appendDesktopLog(`UNCAUGHT_EXCEPTION ${serializeConsoleArgs([error])}`);
  });
  process.on('unhandledRejection', (reason) => {
    appendDesktopLog(`UNHANDLED_REJECTION ${serializeConsoleArgs([reason])}`);
  });

  console.log(`[desktop-log] capturing desktop logs to ${logWriter.resolvePath('desktop')}`);
}

function initializeLlmLogCapture(): void {
  if (llmLogCaptureInitialized) {
    return;
  }
  llmLogCaptureInitialized = true;

  const logWriter = getDailyLogWriter();

  console.log(`[llm-log] capturing LLM logs to ${logWriter.resolvePath('llm')}`);
}

function resolvePreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function resolveRendererUrl(): string {
  const explicitUrl = process.env['ELECTRON_RENDERER_URL'];
  if (explicitUrl) {
    return explicitUrl;
  }
  const rendererUrlArg = process.argv.find((arg) => arg.startsWith('--renderer-url='));
  if (rendererUrlArg) {
    return rendererUrlArg.slice('--renderer-url='.length);
  }

  if (!app.isPackaged) {
    return 'http://localhost:3000';
  }

  throw new Error(
    'Packaged Electron renderer URL is not configured. Set ELECTRON_RENDERER_URL before launching the packaged app.'
  );
}

function getPackagedWebRoot(): string {
  return path.join(process.resourcesPath, 'web');
}

async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve local port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForRendererReady(rendererUrl: string, timeoutMs: number = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(rendererUrl, { method: 'GET' });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Renderer responded with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for renderer: ${String(lastError)}`);
}

async function waitForTcpPort(port: number, host: string = '127.0.0.1', timeoutMs: number = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        socket.once('connect', () => {
          socket.end();
          resolve();
        });
        socket.once('error', reject);
        socket.setTimeout(1000, () => {
          socket.destroy(new Error(`Timed out connecting to ${host}:${port}`));
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for renderer TCP port: ${String(lastError)}`);
}

async function ensurePackagedRendererUrl(): Promise<string> {
  if (packagedRendererUrlPromise) {
    return packagedRendererUrlPromise;
  }

  packagedRendererUrlPromise = (async () => {
    const explicitUrl = process.env['ELECTRON_RENDERER_URL'];
    if (explicitUrl) {
      return explicitUrl;
    }

    const standaloneRoot = getPackagedWebRoot();
    const webRoot = path.join(standaloneRoot, 'packages', 'web');
    const serverPath = path.join(webRoot, 'server.js');
    const port = await findAvailablePort();
    const rendererUrl = `http://127.0.0.1:${port}`;
    const dataRoot = path.join(app.getPath('userData'), 'data');
    // 显式注入 HOME / USERPROFILE，避免子进程（web server 及其 spawn 的
    // bash 子进程）继承异常 HOME，导致 Git Bash/MSYS 回退到挂载根
    // （Windows 打包态曾表现为 /workspace，使技能会话工作目录错乱）。
    const homeDir = app.getPath('home');
    mkdirSync(dataRoot, { recursive: true });
    console.log('[renderer] packaged server env', {
      rendererUrl,
      dataRoot,
      monorepoRoot: process.resourcesPath,
    });

    rendererServerProcess = spawn(process.execPath, [serverPath], {
      cwd: standaloneRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATA_ROOT: dataRoot,
        MONOREPO_ROOT: process.resourcesPath,
        HOME: homeDir,
        USERPROFILE: homeDir,
        HOSTNAME: '127.0.0.1',
        PORT: String(port),
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });

    rendererServerProcess.stdout?.on('data', (chunk) => {
      console.log(`[renderer] ${String(chunk).trimEnd()}`);
    });
    rendererServerProcess.stderr?.on('data', (chunk) => {
      console.error(`[renderer] ${String(chunk).trimEnd()}`);
    });
    rendererServerProcess.once('exit', (code, signal) => {
      console.warn(`[renderer] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      rendererServerProcess = null;
      packagedRendererUrlPromise = null;
    });

    await waitForRendererReady(rendererUrl);
    return rendererUrl;
  })();

  return packagedRendererUrlPromise;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const isDevelopment = !app.isPackaged;
  const rendererUrl = isDevelopment
    ? resolveRendererUrl()
    : await ensurePackagedRendererUrl();

  if (isDevelopment) {
    const rendererAddress = new URL(rendererUrl);
    await waitForTcpPort(
      rendererAddress.port ? Number(rendererAddress.port) : 80,
      rendererAddress.hostname,
      60000,
    );
    await window.loadURL(rendererUrl);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await window.loadURL(rendererUrl);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'OriginOS CE',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#e7edf3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    hasShadow: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  attachDevToolsContextMenu(window);

  void loadRenderer(window).catch((error: unknown) => {
    console.error('[electron] Failed to load renderer', error);
  });

  // Open external links in default browser instead of new Electron window
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) {
    return;
  }
  void (async () => {
  // 防止热重载时重复初始化 IPC handlers（globalThis 跨模块重载保持不变）
  const g = globalThis as Record<string, unknown>;
  if (g['__ipcHandlersRegistered']) return;
  g['__ipcHandlersRegistered'] = true;

  initializeDesktopLogCapture();
  initializeLlmLogCapture();
  processHealthMonitor.start();
  app.on('browser-window-created', (_event, browserWindow) => {
    processHealthMonitor.trackWindow(browserWindow);
  });

  const rendererUrl = !app.isPackaged
    ? resolveRendererUrl()
    : await ensurePackagedRendererUrl();

  if (!app.isPackaged) {
    await waitForRendererReady(rendererUrl, 60000);
  }

  if (rendererUrl) {
    process.env['ELECTRON_RENDERER_URL'] = rendererUrl;
  }

  windowManager = new ElectronWindowManager({
    preloadPath: resolvePreloadPath(),
    ...(rendererUrl ? { rendererUrl } : {}),
  });
  localFileSystem = new LocalFileSystem();
  localAgentBridge = new LocalAgentBridge();
  trayManager = new TrayManager();
  shortcutManager = new ShortcutManager();
  autoUpdaterManager = new AutoUpdaterManager();
  desktopSchedulerService = new DesktopSchedulerService();
  ipcServices.push(new SkillService());
  ipcServices.push(new ProjectService());
  ipcServices.push(new OntologyService());
  ipcServices.push(new UserRegistryService());
  ipcServices.push(new MiscService());
  ipcServices.push(new OntologyDataService());
  ipcServices.push(new CollaborationService());
  ipcServices.push(new AgentSessionService());
  ipcServices.push(new AgentProjectService());
  ipcServices.push(new WorkspaceService());
  ipcServices.push(new EntryExportService());
  mainWindow = createWindow();
  windowManager.setMainWindow(mainWindow);
  windowManager.createDockWindow();
  trayManager.initialize();
  shortcutManager.setDockToggle(() => windowManager?.toggleDock());
  shortcutManager.setSpotlightToggle(() => {
    mainWindow?.webContents.send('toggle-spotlight');
    mainWindow?.show();
    mainWindow?.focus();
  });
  shortcutManager.initialize();
  autoUpdaterManager.setMainWindow(mainWindow);
  void autoUpdaterManager.initialize().then(() => {
    autoUpdaterManager?.scheduleAutoCheck();
  });
  desktopSchedulerService.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      windowManager?.setMainWindow(mainWindow);
      if (mainWindow) {
        autoUpdaterManager?.setMainWindow(mainWindow);
      }
    }
  });
  })().catch((error: unknown) => {
    console.error('[electron] Failed during app bootstrap', error);
    app.quit();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (allowQuitAfterShutdown) {
    return;
  }
  event.preventDefault();
  if (shutdownInProgress) {
    return;
  }
  shutdownInProgress = true;
  processHealthMonitor.stop();
  windowManager?.closeAllWindows();
  localFileSystem?.dispose();
  trayManager?.destroy();
  shortcutManager?.destroy();
  desktopSchedulerService?.stop();
  rendererServerProcess?.kill();
  rendererServerProcess = null;
  void (async () => {
    try {
      await dailyLogWriter?.flush();
      await localAgentBridge?.shutdown();
      await agentManager.shutdown();
      await persistentAgentManager.stopAllAgents();
      await shutdownGlobalSpawner();
    } catch (error) {
      console.error('[electron] Agent shutdown failed; continuing quit', error);
    } finally {
      allowQuitAfterShutdown = true;
      app.quit();
    }
  })();
});
