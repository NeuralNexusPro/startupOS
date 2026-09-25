const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const source = path.join(repoRoot, 'packages', 'web', '.next', 'standalone');
const target = path.join(repoRoot, 'packages', 'desktop', '.packaging', 'web-standalone');
const windowsShortZip = process.env.ORIGINOS_WINDOWS_SHORT_ZIP === '1';

if (!fs.existsSync(source)) {
  throw new Error(`Next standalone output not found: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });

fs.cpSync(source, target, {
  recursive: true,
  dereference: true,
  errorOnExist: false,
  force: true,
});

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
  const stats = fs.statSync(realPath);
  fs.rmSync(linkPath, { recursive: true, force: true });
  const relativeDestination = path.relative(realPath, linkPath);
  if (relativeDestination && !relativeDestination.startsWith('..')
    && !path.isAbsolute(relativeDestination)) {
    // Workspace package links can point at an ancestor of the packaging tree
    // (for example @originos/desktop). Copying that ancestor into its own
    // .packaging directory recurses forever; it is not a runtime dependency
    // of the standalone Web server, so omit the link from the staged tree.
    return;
  }
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
