#!/usr/bin/env node

// Stage a runtime-resolvable @originos/core package for Electron packaging.
//
// Desktop main-process modules are compiled with tsc, which keeps bare
// specifiers verbatim in the emitted JS (see AG.8: startup-critical files
// import `@originos/core/...`). The dev-time resolution goes through the
// pnpm symlink to packages/core, but packages/core is a source-level package
// (exports point at .ts files), which Node cannot load in the packaged app.
// This script mirrors the already-compiled core output (dist-electron/core)
// into .packaging/core-runtime and rewrites package.json exports from
// ./src/*.ts to the compiled .js paths so packaged `require("@originos/core/…")`
// resolves inside the app bundle.
//
// The source exports table cannot be copied verbatim: several entries use
// `*/index.ts`-shaped wildcards while the real consumed modules are flat
// files (e.g. `lib/integrations/pi-agent/cognitive/knowledge-provider.ts`).
// Instead of relying on those wildcards, the staged package gets exact
// exports entries for the closed set of specifiers actually required by the
// compiled artifacts, and validation resolves every one of them.

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const corePackageJson = path.join(repoRoot, 'packages', 'core', 'package.json');
const compiledCoreRoot = path.join(repoRoot, 'dist-electron', 'core');
const distElectronRoot = path.join(repoRoot, 'dist-electron');
const target = path.join(repoRoot, 'packages', 'desktop', '.packaging', 'core-runtime');

function rewriteExports(exports) {
  const rewritten = {};
  for (const [key, value] of Object.entries(exports)) {
    if (typeof value !== 'string') {
      rewritten[key] = value;
      continue;
    }
    rewritten[key] = value.replace(/^\.\/src\/(.+)\.ts$/, './dist/src/$1.js');
  }
  return rewritten;
}

// Collect the closed set of `@originos/core/...` specifiers required by the
// compiled artifacts. tsc emits plain require()/import statements, so a
// literal scan of the packaged dist-electron tree covers every static
// consumption. Computed dynamic specifiers are out of scope here (none
// exist today; a require() failure at app launch would surface them).
const consumedSpecifiers = new Set();
const specifierPattern = /(?:require\(|import\(|from\s+)["'](@originos\/core\/[^"']+)["']/g;

function collectConsumedSpecifiers(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectConsumedSpecifiers(fullPath);
      continue;
    }
    if (!/\.(js|mjs)$/.test(entry.name)) continue;
    const source = fs.readFileSync(fullPath, 'utf8');
    for (const match of source.matchAll(specifierPattern)) {
      consumedSpecifiers.add(match[1]);
    }
  }
}

// Map a consumed specifier to the compiled file: tsc mirrors the source tree
// (index.ts -> index.js), so try the flat .js first, then a directory index.
function resolveCompiledTarget(subpath) {
  const candidates = [
    `./dist/src/${subpath}.js`,
    `./dist/src/${subpath}/index.js`,
  ];
  const found = candidates.find((candidate) => fs.existsSync(path.join(target, candidate)));
  if (!found) {
    throw new Error(
      `No compiled file for consumed specifier @originos/core/${subpath}; tried:\n${candidates.join('\n')}`,
    );
  }
  return found;
}

const sourcePackage = JSON.parse(fs.readFileSync(corePackageJson, 'utf8'));
const compiledExists = fs.existsSync(path.join(compiledCoreRoot, 'src'));
if (!compiledExists) {
  throw new Error(`Compiled core output not found: ${compiledCoreRoot} (run desktop tsc build first)`);
}

collectConsumedSpecifiers(distElectronRoot);
if (consumedSpecifiers.size === 0) {
  throw new Error('No @originos/core specifiers found in dist-electron; staging would be a no-op');
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

// Mirror the compiled tree; keep only runtime JS plus JSON metadata.
fs.cpSync(compiledCoreRoot, path.join(target, 'dist'), {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(compiledCoreRoot, source);
    if (relative === '') return true;
    return relative.split(path.sep)[0] === 'src';
  },
});

const runtimePackage = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  main: sourcePackage.main.replace(/^\.\/src\/(.+)\.ts$/, './dist/src/$1.js'),
  type: sourcePackage.type,
  exports: rewriteExports(sourcePackage.exports ?? {}),
};

// Exact entries win over the (mis-shaped) wildcard matches in Node's exports
// algorithm, so overwriting is what fixes unresolvable specifiers.
for (const specifier of [...consumedSpecifiers].sort()) {
  const subpath = specifier.slice('@originos/core/'.length);
  runtimePackage.exports[`./${subpath}`] = resolveCompiledTarget(subpath);
}

fs.writeFileSync(
  path.join(target, 'package.json'),
  `${JSON.stringify(runtimePackage, null, 2)}\n`,
);

// Fail fast on the consumption set: every specifier required by the compiled
// artifacts must resolve through the staged exports to an existing file.
// Resolution only (no module execution) — full require() smoke runs later
// against the packaged app, because runtime modules keep live handles.
const stagedRequire = createRequire(path.join(target, 'package.json'));
const unresolved = [];
for (const specifier of [...consumedSpecifiers].sort()) {
  try {
    stagedRequire.resolve(specifier);
  } catch {
    unresolved.push(specifier);
  }
}
if (unresolved.length > 0) {
  throw new Error(`Staged @originos/core cannot resolve consumed specifiers:\n${unresolved.join('\n')}`);
}

console.log(
  `[prepare-core-runtime] staged ${compiledCoreRoot} -> ${target}`
  + ` (${Object.keys(runtimePackage.exports).length} exports entries,`
  + ` ${consumedSpecifiers.size} consumed specifiers verified)`,
);
