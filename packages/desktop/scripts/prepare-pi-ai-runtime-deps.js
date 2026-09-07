#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const outputNodeModules = path.join(desktopDir, '.packaging', 'pi-ai-runtime', 'node_modules');
const rootRequire = createRequire(path.join(repoRoot, 'package.json'));

function packageNameParts(packageName) {
  return packageName.startsWith('@') ? packageName.split('/').slice(0, 2) : [packageName];
}

function packageOutputDir(packageName) {
  return path.join(outputNodeModules, ...packageNameParts(packageName));
}

function findPackageJson(packageName, fromRequire) {
  const lookupPaths = fromRequire.resolve.paths(packageName) || [];
  for (const lookupPath of lookupPaths) {
    const candidate = path.join(lookupPath, ...packageNameParts(packageName), 'package.json');
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
  }

  const entry = fromRequire.resolve(packageName);
  let dir = fs.statSync(entry).isDirectory() ? entry : path.dirname(fs.realpathSync(entry));
  while (dir !== path.dirname(dir)) {
    const packageJson = path.join(dir, 'package.json');
    if (fs.existsSync(packageJson)) {
      const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      if (parsed.name === packageName) {
        return packageJson;
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(`Unable to locate package.json for ${packageName}`);
}

function copyPackage(packageName, packageJson) {
  const sourceDir = path.dirname(packageJson);
  const targetDir = packageOutputDir(packageName);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: true,
    force: true,
    filter(source) {
      const relativePath = path.relative(sourceDir, source).replace(/\\/g, '/');
      if (relativePath === 'node_modules' || relativePath.startsWith('node_modules/')) {
        return false;
      }
      return true;
    },
  });
}

function collect(packageName, fromRequire, seen, ordered, optional = false) {
  if (seen.has(packageName)) {
    return;
  }
  seen.add(packageName);

  let packageJson;
  try {
    packageJson = findPackageJson(packageName, fromRequire);
  } catch (error) {
    if (optional && error && error.code === 'MODULE_NOT_FOUND') return;
    throw error;
  }
  const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  ordered.push({ name: packageName, packageJson });

  const packageRequire = createRequire(packageJson);
  const dependencyNames = Object.keys(parsed.dependencies || {}).sort();
  const optionalDependencyNames = Object.keys(parsed.optionalDependencies || {})
    .filter((dependencyName) => !dependencyNames.includes(dependencyName))
    .sort();

  for (const dependencyName of dependencyNames) {
    collect(dependencyName, packageRequire, seen, ordered);
  }
  for (const dependencyName of optionalDependencyNames) {
    collect(dependencyName, packageRequire, seen, ordered, true);
  }
}

const adapterPackageJson = findPackageJson('@originos/pi-agent-adapter', rootRequire);
const adapterRequire = createRequire(adapterPackageJson);
const adapterManifest = JSON.parse(fs.readFileSync(adapterPackageJson, 'utf8'));
const roots = Object.keys(adapterManifest.dependencies || {}).sort();
const optionalRoots = Object.keys(adapterManifest.optionalDependencies || {})
  .filter((root) => !roots.includes(root))
  .sort();

fs.rmSync(outputNodeModules, { recursive: true, force: true });
fs.mkdirSync(outputNodeModules, { recursive: true });

const seen = new Set();
const ordered = [];
for (const root of roots) {
  collect(root, adapterRequire, seen, ordered);
}
for (const root of optionalRoots) {
  collect(root, adapterRequire, seen, ordered, true);
}

for (const item of ordered) {
  copyPackage(item.name, item.packageJson);
}

const adapterDir = path.dirname(adapterPackageJson);
const stagedAdapterDir = packageOutputDir('@originos/pi-agent-adapter');
for (const relativePath of [
  'package.json',
  'task-runtime.js',
  'task-runtime.d.ts',
  'dist/task-runtime.cjs',
]) {
  const source = path.join(adapterDir, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Task Runtime adapter artifact: ${relativePath}`);
  }
  const target = path.join(stagedAdapterDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log(`[prepare-pi-ai-runtime-deps] copied ${ordered.length} packages -> ${path.relative(repoRoot, outputNodeModules)}`);
