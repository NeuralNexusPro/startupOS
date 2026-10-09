#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Make the compiled Electron main process resolve @originos/core from the
// freshly staged runtime package. The compiled main entry lives below
// dist-electron/, so this node_modules directory takes precedence over the
// workspace root. Keeping the link here prevents a previous packaging run from
// silently supplying stale core code through a polluted root node_modules.

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const runtimePackage = path.join(repoRoot, 'packages', 'desktop', '.packaging', 'core-runtime');
const devNodeModules = path.join(repoRoot, 'dist-electron', 'node_modules');
const devCoreLink = path.join(devNodeModules, '@originos', 'core');
const desktopMain = path.join(repoRoot, 'dist-electron', 'desktop', 'src', 'main', 'main.js');

if (!fs.existsSync(path.join(runtimePackage, 'package.json'))) {
  throw new Error(`Staged core runtime not found: ${runtimePackage}`);
}
if (!fs.existsSync(desktopMain)) {
  throw new Error(`Compiled desktop main not found: ${desktopMain}`);
}

fs.mkdirSync(path.dirname(devCoreLink), { recursive: true });
fs.rmSync(devCoreLink, { recursive: true, force: true });
fs.symlinkSync(runtimePackage, devCoreLink, process.platform === 'win32' ? 'junction' : 'dir');

const resolved = createRequire(desktopMain).resolve('@originos/core/lib/features/agent/server');
const expectedRoot = fs.realpathSync(runtimePackage);
const resolvedRealPath = fs.realpathSync(resolved);
const relative = path.relative(expectedRoot, resolvedRealPath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  throw new Error(`Development core runtime resolved outside staging: ${resolvedRealPath}`);
}

console.log(`[prepare-core-dev-runtime] @originos/core -> ${expectedRoot}`);
