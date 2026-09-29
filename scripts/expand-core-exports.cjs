#!/usr/bin/env node

// Expand @originos/core package exports into a consumption-closed explicit whitelist.
//
// Background (AG.9 / Proposal govern-core-public-api):
// packages/core/package.json historically carried 52 wildcard exports entries.
// Under strict Node exports semantics, 23 of the 120 consumed deep-path
// specifiers only resolve because webpack (web) or the F1 staging exact
// entries (desktop packaging) paper over mis-shaped wildcard targets.
// This tool rewrites the exports table into explicit, file-pointing entries
// derived from the actual consumption set, and provides a read-only gate.
//
// Modes:
//   node scripts/expand-core-exports.cjs             -> expand (writes package.json)
//   node scripts/expand-core-exports.cjs --verify    -> read-only gate, non-zero exit on failure
//   node scripts/expand-core-exports.cjs --dry-run   -> expand preview, no write
//   node scripts/expand-core-exports.cjs --section <prefix>
//                                                    -> expand only specs under a given
//                                                       subpath prefix (staged rollout);
//                                                       untouched sections keep their entries
//
// Verification assertions (--verify):
//   (a) exports contains zero wildcard entries (no key with '*')
//   (b) every consumed specifier exactly matches an exports entry and resolves
//       through strict Node exports semantics (require.resolve from the web
//       workspace, where the pnpm symlink lives) to an existing file
//   (c) every consumed core feature directory exposes both a `<feature>` facade
//       entry and a `<feature>/types` entry (types.ts preferred; the actual type
//       entry file is reported when types.ts is absent)
//   (d) no dangling exports entries (every target file exists)

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const corePackageJsonPath = path.join(repoRoot, 'packages', 'core', 'package.json');
const coreSrcRoot = path.join(repoRoot, 'packages', 'core', 'src');
const consumerRoots = [
  path.join(repoRoot, 'packages', 'web', 'src'),
  path.join(repoRoot, 'packages', 'desktop', 'src'),
];
const webPackageDir = path.join(repoRoot, 'packages', 'web');

// ---------------------------------------------------------------------------
// Specifier scanning
// ---------------------------------------------------------------------------

// String literal forms: `from "..."`, require("..."), import("..."), vi.mock("..."),
// bare side-effect `import "..."`, plus quoted specifiers in test mock tables.
// The union of these two patterns covers every literal `@originos/core/...`
// occurrence in web/desktop sources (static imports, side-effect imports,
// dynamic import(), require(), and vi.mock module keys).
const SPECIFIER_PATTERNS = [
  /(?:from\s+|require\(\s*|import\(\s*|import\s*\(\s*|vi\.mock\(\s*)["'](@originos\/core\/[^"']+)["']/g,
  /["'](@originos\/core\/[^"']+)["']/g,
];

function collectConsumedSpecifiers() {
  const found = new Map(); // spec -> Set<file>
  function visit(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!/\.(?:[cm]?[jt]s|[cm]?[jt]sx)$/.test(entry.name)) continue;
      const source = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const spec = match[1].slice('@originos/core/'.length);
          if (!found.has(spec)) found.set(spec, new Set());
          found.get(spec).add(path.relative(repoRoot, fullPath));
        }
      }
    }
  }
  for (const root of consumerRoots) visit(root);
  return found;
}

// ---------------------------------------------------------------------------
// Spec -> source file resolution
// ---------------------------------------------------------------------------

// Resolution order mirrors Node/TS behavior: explicit exports entries win
// (kept as-is), otherwise try `<spec>.ts`, `<spec>.tsx`, `<spec>/index.ts`.
// A .tsx target is only accepted when no .ts sibling exists (tsx is the
// MultiAgentLauncher form; webpack and tsc both resolve it).
function resolveSpecToTarget(spec) {
  const candidates = [
    `./src/${spec}.ts`,
    `./src/${spec}.tsx`,
    `./src/${spec}/index.ts`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(repoRoot, 'packages', 'core', candidate))) {
      return candidate;
    }
  }
  return null;
}

function isWildcardKey(key) {
  return key.includes('*');
}

// A wildcard key like "./lib/features/*/types" matches a spec "lib/features/agent/types"
// when the key's segments line up with exactly one '*' consuming one segment.
function wildcardMatches(key, spec) {
  const sub = `./${spec}`;
  if (!key.includes('*')) return key === sub;
  const parts = key.split('*');
  if (parts.length !== 2) return false; // multi-* keys are not used for single-spec matching
  const [head, tail] = parts;
  if (!sub.startsWith(head) || !sub.endsWith(tail)) return false;
  const middle = sub.slice(head.length, sub.length - tail.length);
  return middle.length > 0 && !middle.includes('*');
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function expand({ dryRun = false, sectionPrefix = null } = {}) {
  const pkg = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf8'));
  const oldExports = pkg.exports;
  const consumed = collectConsumedSpecifiers();
  const specs = [...consumed.keys()].sort();

  const report = {
    specs,
    consumers: consumed,
    added: [],
    kept: [],
    removedWildcards: [],
    removedExplicit: [],
    unresolved: [],
    fallbackNotes: [],
    targetCounts: {},
  };

  const nextExports = {};

  // 1. Carry over "." main entry and any non-spec-path keys untouched.
  //    "." is the package root entry; keep it regardless of consumption form.
  if (oldExports['.'] !== undefined) {
    nextExports['.'] = oldExports['.'];
  }

  // 2. Determine which existing explicit entries remain.
  //    Keep "." (handled above). Other explicit entries are kept when they are
  //    consumed directly (spec present in consumption set) OR when they belong
  //    to the mandatory facade floor (feature facade + types entries).
  const explicitKeys = Object.keys(oldExports).filter(
    (k) => k !== '.' && !isWildcardKey(k),
  );
  const explicitKeysToKeep = new Set();
  for (const key of explicitKeys) {
    const spec = key.slice(1); // "./x" -> "x"
    if (consumed.has(spec)) {
      explicitKeysToKeep.add(key);
    }
  }
  // Mandatory facade floor entries: for every consumed spec that lives under a
  // feature directory (lib/features/<feature>/...), ensure the facade entry
  // "./lib/features/<feature>" and a types entry "./lib/features/<feature>/types".
  const featureDirs = new Map(); // featureName -> { hasConsumption, typesTarget }
  for (const spec of specs) {
    const m = spec.match(/^lib\/features\/([^/]+)(?:\/.*)?$/);
    if (!m) continue;
    const feature = m[1];
    if (!featureDirs.has(feature)) featureDirs.set(feature, { hasConsumption: false, typesTarget: null });
    featureDirs.get(feature).hasConsumption = true;
  }
  for (const [feature, info] of featureDirs) {
    if (!info.hasConsumption) continue;
    const facadeKey = `./lib/features/${feature}`;
    const facadeTarget = `./src/lib/features/${feature}/index.ts`;
    if (!fs.existsSync(path.join(repoRoot, 'packages', 'core', facadeTarget))) {
      report.unresolved.push(`${facadeKey} (facade floor: ${facadeTarget} missing)`);
      continue;
    }
    if (!(facadeKey in oldExports) || oldExports[facadeKey] !== facadeTarget) {
      if (!(facadeKey in nextExports)) report.added.push(`${facadeKey} -> ${facadeTarget} (facade floor)`);
    }
    // types entry: prefer types.ts, else fall back to the feature's actual
    // type entry and note the fallback in the output (spec: facade-floor
    // "types.ts 不存在时以 feature 实际类型入口替代并注明").
    const typesCandidates = [
      `./src/lib/features/${feature}/types.ts`,
      `./src/lib/features/${feature}/types/index.ts`,
    ];
    let typesTarget = null;
    for (const c of typesCandidates) {
      if (fs.existsSync(path.join(repoRoot, 'packages', 'core', c))) { typesTarget = c; break; }
    }
    if (!typesTarget && feature === 'agent') {
      // agent's type surface lives in the shared types layer (re-exported by
      // the feature facade); src/types/agent.ts is the actual type entry.
      const shared = './src/types/agent.ts';
      if (fs.existsSync(path.join(repoRoot, 'packages', 'core', shared))) {
        typesTarget = shared;
        report.fallbackNotes.push(`${feature}: no types.ts; using shared type entry ${shared}`);
      }
    }
    if (!typesTarget) {
      // generic fallback: types flow through the feature facade
      typesTarget = facadeTarget;
      report.fallbackNotes.push(`${feature}: no types.ts; types subpath points at feature facade ${facadeTarget}`);
    }
    info.typesTarget = typesTarget;
  }

  // 3. Resolve every consumed spec to a target file.
  const specTargets = new Map();
  for (const spec of specs) {
    // section filter for staged rollout
    if (sectionPrefix && !spec.startsWith(sectionPrefix)) continue;
    const target = resolveSpecToTarget(spec);
    if (!target) {
      report.unresolved.push(spec);
      continue;
    }
    specTargets.set(spec, target);
    const key = `./${spec}`;
    report.targetCounts[key] = target;
  }

  // 4. Build next exports:
  //    - "." kept
  //    - explicit entries: keep if consumed as spec, or if they are facade-floor keys
  //    - wildcard entries: drop (every consumed spec they matched now has an
  //      explicit entry; wildcards matching nothing are dropped unconditionally)
  //    - one explicit entry per consumed spec
  const facadeFloorKeys = new Set();
  for (const [feature, info] of featureDirs) {
    if (!info.hasConsumption) continue;
    facadeFloorKeys.add(`./lib/features/${feature}`);
    if (info.typesTarget) {
      const key = `./lib/features/${feature}/types`;
      facadeFloorKeys.add(key);
    }
  }

  for (const [key, value] of Object.entries(oldExports)) {
    if (key === '.') continue;
    if (isWildcardKey(key)) {
      // In section mode only drop wildcards that at least one in-scope spec
      // matches (those specs get exact entries now). Wildcards outside the
      // section survive until their own batch runs; the final full run
      // (no --section) removes every wildcard unconditionally per D1.
      const coveredByScope = sectionPrefix
        ? specs.some((s) => specTargets.has(s) && wildcardMatches(key, s))
        : true;
      if (sectionPrefix && !coveredByScope) {
        nextExports[key] = value;
        report.kept.push(`${key} -> ${value} (out of section scope, kept)`);
        continue;
      }
      report.removedWildcards.push(`${key} -> ${value}`);
      continue;
    }
    const spec = key.slice(1);
    const isConsumed = specTargets.has(spec);
    const isFacadeFloor = facadeFloorKeys.has(key);
    const outOfSection = sectionPrefix !== null && !spec.startsWith(sectionPrefix);
    if (outOfSection) {
      // Staged rollout: entries outside the current section survive untouched
      // (their specs are handled in a later batch).
      nextExports[key] = value;
      report.kept.push(`${key} -> ${value} (out of section scope, kept)`);
    } else if (isConsumed || isFacadeFloor) {
      // explicit entries keep their original target (they already point at real files)
      nextExports[key] = value;
      report.kept.push(`${key} -> ${value}`);
    } else {
      report.removedExplicit.push(`${key} -> ${value}`);
    }
  }

  for (const [spec, target] of specTargets) {
    const key = `./${spec}`;
    if (key in nextExports) continue;
    nextExports[key] = target;
    report.added.push(`${key} -> ${target}`);
  }

  // facade floor entries that were not already added above
  for (const key of facadeFloorKeys) {
    if (key in nextExports) continue;
    if (key === '.' || key.endsWith('/types')) {
      const feature = key.match(/^\.\/lib\/features\/([^/]+)/)?.[1];
      const info = feature ? featureDirs.get(feature) : null;
      if (info?.typesTarget) {
        nextExports[key] = info.typesTarget;
        report.added.push(`${key} -> ${info.typesTarget} (facade floor: types)`);
      }
      continue;
    }
    const target = `./src/lib/features/${key.replace('./lib/features/', '')}/index.ts`;
    if (fs.existsSync(path.join(repoRoot, 'packages', 'core', target))) {
      nextExports[key] = target;
      report.added.push(`${key} -> ${target} (facade floor)`);
    }
  }

  // sort keys for stable output
  const sorted = {};
  const keys = Object.keys(nextExports).sort((a, b) => {
    if (a === '.') return -1;
    if (b === '.') return 1;
    return a.localeCompare(b);
  });
  for (const k of keys) sorted[k] = nextExports[k];

  report.nextExports = sorted;
  return report;
}

// ---------------------------------------------------------------------------
// Verification (strict Node exports semantics via require.resolve from web)
// ---------------------------------------------------------------------------

function verifyStrictResolution(specs) {
  // Run inside packages/web so the pnpm symlink + exports walk is exercised
  // under real Node resolution. resolve only (no module execution).
  const script = `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(path.join(webPackageDir, 'package.json'))});
    const specs = ${JSON.stringify(specs)};
    const failures = [];
    for (const s of specs) {
      try { req.resolve('@originos/core/' + s); } catch (e) {
        failures.push(s + ' [' + (e.code || 'ERROR') + ']');
      }
    }
    if (failures.length) {
      console.error(JSON.stringify(failures, null, 2));
      process.exit(1);
    }
    console.log('all ' + specs.length + ' specifiers resolve via strict Node exports semantics');
  `;
  execFileSync(process.execPath, ['-e', script], { cwd: webPackageDir, stdio: 'pipe' });
}

function verify() {
  const pkg = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf8'));
  const exportsTable = pkg.exports ?? {};
  const consumed = collectConsumedSpecifiers();
  const specs = [...consumed.keys()].sort();
  const errors = [];

  // (a) zero wildcards
  const wildcardKeys = Object.keys(exportsTable).filter(isWildcardKey);
  if (wildcardKeys.length > 0) {
    errors.push(`FAIL (zero-wildcard): ${wildcardKeys.length} wildcard entries remain:\n  ${wildcardKeys.join('\n  ')}`);
  }

  // (d) no dangling entries (checked against the source tree)
  const dangling = [];
  for (const [key, value] of Object.entries(exportsTable)) {
    if (key === '.' || isWildcardKey(key)) continue;
    if (typeof value !== 'string') continue;
    const target = value.replace(/^\.\//, '');
    if (!fs.existsSync(path.join(repoRoot, 'packages', 'core', target))) {
      dangling.push(`${key} -> ${value}`);
    }
  }
  if (dangling.length > 0) {
    errors.push(`FAIL (no-dangling): ${dangling.length} exports entries point at missing files:\n  ${dangling.join('\n  ')}`);
  }

  // (b) every consumed spec exactly hits an entry with an existing target
  const misses = [];
  for (const spec of specs) {
    const key = `./${spec}`;
    const target = exportsTable[key];
    if (target === undefined) {
      misses.push(`${spec}: no exports entry`);
      continue;
    }
    if (typeof target !== 'string') {
      misses.push(`${spec}: non-string target`);
      continue;
    }
    const rel = target.replace(/^\.\//, '');
    if (!fs.existsSync(path.join(repoRoot, 'packages', 'core', rel))) {
      misses.push(`${spec}: target missing (${target})`);
    }
  }
  if (misses.length > 0) {
    errors.push(`FAIL (consumption closed-set): ${misses.length} consumed specifiers miss or dangle:\n  ${misses.join('\n  ')}`);
  }

  // strict Node semantics: resolve every consumed specifier from the web workspace
  if (misses.length === 0 && wildcardKeys.length === 0) {
    try {
      verifyStrictResolution(specs);
    } catch (err) {
      const stdout = err.stdout ? err.stdout.toString() : '';
      const stderr = err.stderr ? err.stderr.toString() : '';
      errors.push(`FAIL (strict resolution): require.resolve failures under packages/web:\n${stdout}${stderr}`);
    }
  }

  // (c) facade floor for every consumed feature directory
  const featureNames = new Set();
  for (const spec of specs) {
    const m = spec.match(/^lib\/features\/([^/]+)/);
    if (m) featureNames.add(m[1]);
  }
  const facadeMissing = [];
  const typesFallbackNotes = [];
  for (const feature of [...featureNames].sort()) {
    const facadeKey = `./lib/features/${feature}`;
    if (!(facadeKey in exportsTable)) {
      facadeMissing.push(`${facadeKey}: facade entry missing`);
    } else {
      const facadeTarget = exportsTable[facadeKey];
      const rel = String(facadeTarget).replace(/^\.\//, '');
      const facadeExists =
        fs.existsSync(path.join(repoRoot, 'packages', 'core', rel)) &&
        (rel.endsWith('/index.ts') || rel.endsWith('.ts'));
      if (!facadeExists) facadeMissing.push(`${facadeKey}: invalid target ${facadeTarget}`);
    }
    const typesKey = `./lib/features/${feature}/types`;
    if (!(typesKey in exportsTable)) {
      facadeMissing.push(`${typesKey}: types entry missing`);
    } else {
      const typesTarget = String(exportsTable[typesKey]).replace(/^\.\//, '');
      const typesFile = path.join(repoRoot, 'packages', 'core', typesTarget);
      if (!fs.existsSync(typesFile)) {
        facadeMissing.push(`${typesKey}: target missing (${exportsTable[typesKey]})`);
      } else if (!typesTarget.endsWith('/types.ts') && !typesTarget.endsWith('/types/index.ts')) {
        typesFallbackNotes.push(`${typesKey} -> ${exportsTable[typesKey]} (fallback: no types.ts in this feature)`);
      }
    }
  }
  if (facadeMissing.length > 0) {
    errors.push(`FAIL (facade floor): ${facadeMissing.length} gaps:\n  ${facadeMissing.join('\n  ')}`);
  }

  // summary
  const explicitCount = Object.keys(exportsTable).filter((k) => !isWildcardKey(k)).length;
  console.log(`[expand-core-exports] consumed specifiers: ${specs.length}`);
  console.log(`[expand-core-exports] exports entries: ${explicitCount} explicit / ${wildcardKeys.length} wildcard`);
  for (const note of typesFallbackNotes) console.log(`[expand-core-exports] note: ${note}`);
  if (errors.length > 0) {
    console.error(`\n[expand-core-exports] VERIFY FAILED with ${errors.length} error group(s):\n`);
    for (const e of errors) console.error(e + '\n');
    process.exit(1);
  }
  console.log('[expand-core-exports] VERIFY PASSED: zero wildcards, closed-set hit, facade floor, no dangling entries');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const verifyMode = args.includes('--verify');
  const dryRun = args.includes('--dry-run');
  let sectionPrefix = null;
  const sectionIdx = args.indexOf('--section');
  if (sectionIdx !== -1) {
    sectionPrefix = args[sectionIdx + 1];
    if (!sectionPrefix) {
      console.error('--section requires a subpath prefix, e.g. "lib/features"');
      process.exit(2);
    }
  }

  if (verifyMode) {
    verify();
    return;
  }

  const report = expand({ dryRun, sectionPrefix });

  console.log(`consumed specifiers scanned: ${report.specs.length}`);
  console.log(`in-scope for this run: ${report.targetCounts ? Object.keys(report.targetCounts).length : 0}${sectionPrefix ? ` (section prefix: "${sectionPrefix}")` : ''}`);
  console.log(`\n=== spec -> target map (${Object.keys(report.targetCounts).length} entries) ===`);
  for (const [key, target] of Object.entries(report.targetCounts)) {
    console.log(`  ${key} -> ${target}`);
  }
  console.log(`\n=== wildcards removed (${(report.removedWildcards || []).length}) ===`);
  for (const line of report.removedWildcards || []) console.log(`  - ${line}`);
  console.log(`\n=== explicit entries kept (${report.kept.length}) ===`);
  for (const line of report.kept) console.log(`  = ${line}`);
  console.log(`\n=== explicit entries removed (${report.removedExplicit.length}) ===`);
  for (const line of report.removedExplicit) console.log(`  - ${line}`);
  console.log(`\n=== entries added (${report.added.length}) ===`);
  for (const line of report.added) console.log(`  + ${line}`);
  if (report.fallbackNotes.length > 0) {
    console.log(`\n=== types-entry fallbacks noted (${report.fallbackNotes.length}) ===`);
    for (const line of report.fallbackNotes) console.log(`  ~ ${line}`);
  }
  if (report.unresolved.length > 0) {
    console.error(`\n=== UNRESOLVED SPECIFIERS (${report.unresolved.length}) — refusing to write ===`);
    for (const s of report.unresolved) console.error(`  ! ${s}`);
    process.exit(1);
  }
  const wildcardTotal = Object.keys(report.nextExports).filter(isWildcardKey).length;
  console.log(`\nprojected exports: ${Object.keys(report.nextExports).length} entries / ${wildcardTotal} wildcards`);

  if (dryRun) {
    console.log('[dry-run] no files written');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf8'));
  pkg.exports = report.nextExports;
  fs.writeFileSync(corePackageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[expand] wrote ${corePackageJsonPath}`);
}

main();
