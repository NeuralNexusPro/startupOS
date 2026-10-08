#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const compiledRoot = path.join(repoRoot, 'dist-electron');
const stagedCoreRoot = path.join(desktopDir, '.packaging', 'core-runtime');
const workspaceServicePath = path.join(
  compiledRoot,
  'desktop',
  'src',
  'main',
  'services',
  'workspace-service.js',
);
const ipcProtocolPath = path.join(
  compiledRoot,
  'core',
  'src',
  'lib',
  'integrations',
  'electron',
  'ipc-protocol.js',
);

function fail(message) {
  throw new Error(`[verify-workspace-upload-ipc] ${message}`);
}

async function main() {
  if (!fs.existsSync(workspaceServicePath) || !fs.existsSync(ipcProtocolPath)) {
    fail('compiled WorkspaceService or IPC protocol is missing; run desktop build first');
  }
  const stagedCoreManifestPath = path.join(stagedCoreRoot, 'package.json');
  if (!fs.existsSync(stagedCoreManifestPath)) {
    fail('staged core runtime is missing; run prepare-core-runtime first');
  }
  const stagedCoreExports = JSON.parse(fs.readFileSync(stagedCoreManifestPath, 'utf8')).exports;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-workspace-ipc-'));
  const dataRoot = path.join(tempRoot, 'data');
  process.env.DATA_ROOT = dataRoot;
  process.env.MONOREPO_ROOT = repoRoot;
  fs.mkdirSync(dataRoot, { recursive: true });

  const handlers = new Map();
  const electronMock = {
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
  };
  const originalLoad = Module._load;
  const resolvedCoreExports = new Set();
  Module._load = function loadWithElectronMock(request, parent, isMain) {
    if (request === 'electron') {
      return electronMock;
    }
    if (request === '@originos/core' || request.startsWith('@originos/core/')) {
      const exportKey = request === '@originos/core'
        ? '.'
        : `./${request.slice('@originos/core/'.length)}`;
      const exportPath = stagedCoreExports?.[exportKey];
      if (typeof exportPath !== 'string') {
        fail(`staged core runtime does not export ${request}`);
      }
      const resolvedPath = path.resolve(stagedCoreRoot, exportPath);
      if (!resolvedPath.startsWith(`${stagedCoreRoot}${path.sep}`) || !fs.existsSync(resolvedPath)) {
        fail(`staged core runtime export is missing: ${request}`);
      }
      resolvedCoreExports.add(request);
      return originalLoad.call(this, resolvedPath, parent, isMain);
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { IPC_CHANNELS } = require(ipcProtocolPath);
    const { WorkspaceService } = require(workspaceServicePath);
    if (!resolvedCoreExports.has('@originos/core/lib/paths')) {
      fail('WorkspaceService did not resolve paths through the staged core runtime');
    }
    new WorkspaceService();

    const upload = handlers.get(IPC_CHANNELS.WORKSPACE_FILE_UPLOAD);
    if (typeof upload !== 'function') {
      fail('workspace upload IPC handler was not registered');
    }

    const missingRequest = await upload({}, null);
    if (missingRequest.success || missingRequest.error?.code !== 'INVALID_REQUEST') {
      fail('null IPC request did not return INVALID_REQUEST');
    }

    const first = await upload({}, {
      basePath: 'data/agents/release-smoke',
      files: [
        {
          name: 'attachment.txt',
          content: Buffer.from('first attachment').toString('base64'),
          encoding: 'base64',
        },
      ],
    });
    if (!first.success || first.data?.files?.[0]?.path !== 'attachment.txt') {
      fail(`forward-slash role-agent upload failed: ${JSON.stringify(first)}`);
    }

    const duplicate = await upload({}, {
      basePath: 'data\\agents\\release-smoke',
      files: [
        {
          name: 'attachment.txt',
          content: Buffer.from('second attachment').toString('base64'),
          encoding: 'base64',
        },
      ],
    });
    if (!duplicate.success || duplicate.data?.files?.[0]?.path !== 'attachment (1).txt') {
      fail(`backslash duplicate upload was not safely renamed: ${JSON.stringify(duplicate)}`);
    }

    const unsafe = await upload({}, {
      basePath: 'data/agents/release-smoke',
      files: [
        {
          name: '../escape.txt',
          content: Buffer.from('escape').toString('base64'),
          encoding: 'base64',
        },
      ],
    });
    if (unsafe.success || unsafe.error?.code !== 'INVALID_FILE_NAME') {
      fail('unsafe upload file name was not rejected');
    }

    const agentDir = path.join(dataRoot, 'agents', 'release-smoke');
    if (fs.readFileSync(path.join(agentDir, 'attachment.txt'), 'utf8') !== 'first attachment') {
      fail('first attachment content mismatch');
    }
    if (fs.readFileSync(path.join(agentDir, 'attachment (1).txt'), 'utf8') !== 'second attachment') {
      fail('renamed attachment content mismatch');
    }
    if (fs.existsSync(path.join(dataRoot, 'agents', 'escape.txt'))) {
      fail('unsafe upload escaped the role-agent directory');
    }

    console.log('[verify-workspace-upload-ipc] WorkspaceService upload IPC smoke ok');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
