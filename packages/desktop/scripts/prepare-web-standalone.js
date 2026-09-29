const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const source = path.join(repoRoot, 'packages', 'web', '.next', 'standalone');
const target = path.join(repoRoot, 'packages', 'desktop', '.packaging', 'web-standalone');
const windowsShortZip = process.env.ORIGINOS_WINDOWS_SHORT_ZIP === '1';
const workspaceUiPackages = [
  fs.realpathSync(path.join(repoRoot, 'packages', 'web')),
  fs.realpathSync(path.join(repoRoot, 'packages', 'desktop')),
];

function isWorkspaceUiPackage(realPath) {
  return workspaceUiPackages.some((workspacePath) => (
    realPath === workspacePath
    || (!path.relative(workspacePath, realPath).startsWith('..')
      && !path.isAbsolute(path.relative(workspacePath, realPath)))
  ));
}

function destinationIsInsideSource(sourcePath, destinationPath) {
  const relativePath = path.relative(sourcePath, destinationPath);
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath));
}

// True when candidatePath is inside ancestorPath (or equal to it).
function isPathInside(candidatePath, ancestorPath) {
  const relativePath = path.relative(ancestorPath, candidatePath);
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath));
}

function copyStandaloneEntry(sourcePath, destinationPath) {
  const stats = fs.lstatSync(sourcePath);
  if (stats.isSymbolicLink()) {
    const realPath = fs.realpathSync(sourcePath);
    if (isWorkspaceUiPackage(realPath) || destinationIsInsideSource(realPath, destinationPath)) {
      return false;
    }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.symlinkSync(realPath, destinationPath, fs.statSync(realPath).isDirectory() ? 'dir' : 'file');
    return true;
  }

  if (stats.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyStandaloneEntry(path.join(sourcePath, entry), path.join(destinationPath, entry));
    }
    return true;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  fs.chmodSync(destinationPath, stats.mode);
  return true;
}

if (!fs.existsSync(source)) {
  throw new Error(`Next standalone output not found: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });

// Walk the source before any dereferencing copy. fs.cpSync({ dereference: true })
// expands workspace links here, before materializeSymlink can guard them.
copyStandaloneEntry(source, target);

function collectSymlinks(dir) {
  const symlinks = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      symlinks.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      symlinks.push(...collectSymlinks(fullPath));
    }
  }
  return symlinks;
}

function materializeSymlink(linkPath) {
  const realPath = fs.realpathSync(linkPath);
  if (isWorkspaceUiPackage(realPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
    return;
  }
  if (destinationIsInsideSource(realPath, linkPath)) {
    fs.rmSync(linkPath, { recursive: true, force: true });
    return;
  }
  // Materializing the monorepo root node_modules into the staged tree
  // recurses forever whenever a self-referential node_modules link exists
  // anywhere inside it (each pass copies the whole tree back in with a fresh
  // copy of the same link; observed growth: 130 GB). The root store is never
  // a runtime dependency shape, so drop such links instead.
  if (realPath === fs.realpathSync(path.join(repoRoot, 'node_modules'))) {
    fs.rmSync(linkPath, { recursive: true, force: true });
    return;
  }
  const stats = fs.statSync(realPath);
  fs.rmSync(linkPath, { recursive: true, force: true });
  if (stats.isDirectory()) {
    fs.cpSync(realPath, linkPath, {
      recursive: true,
      dereference: true,
      errorOnExist: false,
      force: true,
    });
    return;
  }
  fs.copyFileSync(realPath, linkPath);
}

function copyPackageIfMissing(packageSource, packageName, destinationNodeModules) {
  try {
    const realSource = fs.realpathSync(packageSource);
    // Store entries staged inside the packaging tree live under the desktop
    // workspace path, so the prefix check alone would refuse to hoist them.
    // Only refuse packages that resolve into the actual workspace sources
    // outside the packaging target.
    if (!isPathInside(realSource, target) && isWorkspaceUiPackage(realSource)) {
      return false;
    }
  } catch {
    // Preserve the existing copy path so the actual filesystem error remains visible.
  }
  const destination = path.join(destinationNodeModules, ...packageName.split('/'));
  if (fs.existsSync(destination)) {
    return false;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(packageSource, destination, {
    recursive: true,
    dereference: true,
    errorOnExist: false,
    force: true,
  });
  return true;
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Packaged standalone missing required file: ${filePath}`);
  }
}

function listPnpmPackages(pnpmRoot) {
  if (!fs.existsSync(pnpmRoot)) {
    return [];
  }

  const packages = [];
  for (const storeEntry of fs.readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!storeEntry.isDirectory()) continue;
    const nodeModules = path.join(pnpmRoot, storeEntry.name, 'node_modules');
    if (!fs.existsSync(nodeModules)) continue;

    for (const packageEntry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
      const packagePath = path.join(nodeModules, packageEntry.name);
      if (packageEntry.name.startsWith('@') && packageEntry.isDirectory()) {
        for (const scopedEntry of fs.readdirSync(packagePath, { withFileTypes: true })) {
          if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue;
          packages.push({
            name: `${packageEntry.name}/${scopedEntry.name}`,
            source: path.join(packagePath, scopedEntry.name),
          });
        }
        continue;
      }
      if (!packageEntry.isDirectory() && !packageEntry.isSymbolicLink()) continue;
      packages.push({ name: packageEntry.name, source: packagePath });
    }
  }
  return packages;
}

function listNodeModulesPackages(nodeModulesRoot) {
  if (!fs.existsSync(nodeModulesRoot)) {
    return [];
  }

  const packages = [];
  for (const packageEntry of fs.readdirSync(nodeModulesRoot, { withFileTypes: true })) {
    if (packageEntry.name === '.bin' || packageEntry.name === '.pnpm') continue;
    const packagePath = path.join(nodeModulesRoot, packageEntry.name);
    if (packageEntry.name.startsWith('@') && packageEntry.isDirectory()) {
      for (const scopedEntry of fs.readdirSync(packagePath, { withFileTypes: true })) {
        if (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) continue;
        packages.push({
          name: `${packageEntry.name}/${scopedEntry.name}`,
          source: path.join(packagePath, scopedEntry.name),
        });
      }
      continue;
    }
    if (!packageEntry.isDirectory() && !packageEntry.isSymbolicLink()) continue;
    packages.push({ name: packageEntry.name, source: packagePath });
  }
  return packages;
}

let materializedCount = 0;
for (let pass = 0; pass < 20; pass += 1) {
  const symlinks = collectSymlinks(target);
  if (symlinks.length === 0) {
    break;
  }
  for (const symlink of symlinks) {
    materializeSymlink(symlink);
    materializedCount += 1;
  }
}

const remaining = collectSymlinks(target);
if (remaining.length > 0) {
  throw new Error(`Packaged standalone still contains symlinks:\n${remaining.join('\n')}`);
}

const rootNodeModules = path.join(target, 'node_modules');
const webNodeModules = path.join(target, 'packages', 'web', 'node_modules');
const pnpmRoot = path.join(rootNodeModules, '.pnpm');
fs.mkdirSync(webNodeModules, { recursive: true });

let hoistedCount = 0;
for (const packageInfo of [
  ...listPnpmPackages(pnpmRoot),
  ...listNodeModulesPackages(rootNodeModules),
]) {
  if (copyPackageIfMissing(packageInfo.source, packageInfo.name, webNodeModules)) {
    hoistedCount += 1;
  }
}

for (let pass = 0; pass < 20; pass += 1) {
  const symlinks = collectSymlinks(target);
  if (symlinks.length === 0) {
    assertFile(path.join(webNodeModules, 'next', 'dist', 'server', 'next.js'));
    assertFile(path.join(webNodeModules, 'styled-jsx', 'package.json'));
    if (windowsShortZip) {
      fs.rmSync(pnpmRoot, { recursive: true, force: true });
    }
    const shortZipMessage = windowsShortZip ? '; removed root .pnpm store' : '';
    console.log(`[prepare-web-standalone] copied ${source} -> ${target}; materialized ${materializedCount} symlinks; hoisted ${hoistedCount} packages${shortZipMessage}`);
    process.exit(0);
  }
  for (const symlink of symlinks) {
    materializeSymlink(symlink);
    materializedCount += 1;
  }
}

const finalRemaining = collectSymlinks(target);
throw new Error(`Packaged standalone still contains symlinks:\n${finalRemaining.join('\n')}`);
