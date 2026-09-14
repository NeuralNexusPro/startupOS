#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(desktopRoot, '..', '..');
const rootOutput = path.join(repositoryRoot, 'dist-electron');
const desktopOutput = path.join(desktopRoot, 'dist-electron');
const webOutput = path.join(repositoryRoot, 'packages', 'web', '.next');
const operation = process.argv[2];

if (operation === 'clean') {
  fs.rmSync(webOutput, { force: true, recursive: true });
  fs.rmSync(rootOutput, { force: true, recursive: true });
  process.exit(0);
}

if (operation === 'stage') {
  fs.rmSync(desktopOutput, { force: true, recursive: true });
  fs.mkdirSync(desktopOutput, { recursive: true });
  fs.cpSync(rootOutput, desktopOutput, { recursive: true });
  process.exit(0);
}

throw new Error('Usage: desktop-build-files.js <clean|stage>');
