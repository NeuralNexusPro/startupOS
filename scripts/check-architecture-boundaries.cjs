#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { ESLint } = require('eslint');
const config = require('../.eslintrc.cjs');

const root = path.resolve(__dirname, '..');
const rule = 'import/no-restricted-paths';
const packages = ['web', 'core', 'desktop', 'perception-plugins/email', 'perception-plugins/wecom', 'perception-plugins/feishu', 'perception-plugins/dingtalk'];
const excluded = new Set(['node_modules', 'dist', 'dist-electron', '.next', 'release', 'data', 'test', 'tests', '__tests__', '__mocks__', 'mocks', 'coverage']);

async function sourceFiles(repo) {
  const files = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && !excluded.has(entry.name)) await visit(file);
      if (entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)
        && !/(?:\.d\.[cm]?ts|\.(?:test|spec)\.[cm]?[jt]sx?)$/.test(entry.name)) files.push(file);
    }
  }
  for (const pkg of packages) await visit(path.join(repo, 'packages', pkg, 'src'));
  if (!files.length) throw new Error('架构扫描集合为空：未找到生产源码。');
  return files.sort();
}

function checker(repo, cfg, extraRules = {}) {
  return new ESLint({
    cwd: repo,
    useEslintrc: false,
    allowInlineConfig: false,
    ignore: false,
    baseConfig: {
      parser: require.resolve('@typescript-eslint/parser'),
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
      plugins: ['import'],
      rules: { [rule]: ['error', cfg.rules[rule][1]], ...extraRules },
      overrides: cfg.overrides.filter((override) => override.settings),
    },
    resolvePluginsRelativeTo: root,
  });
}

async function selfTest() {
  const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'originos-boundaries-')));
  const cwd = process.cwd();
  async function write(file, content = 'export const value = 1; export type Value = number;\n') {
    const target = path.join(fixture, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  try {
    await fs.mkdir(path.join(fixture, 'pages'));
    await fs.symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
    await fs.copyFile(path.join(root, '.eslintrc.cjs'), path.join(fixture, '.eslintrc.cjs'));
    await write('scripts/check-architecture-boundaries.cjs', await fs.readFile(__filename));
    for (const pkg of packages) {
      await fs.mkdir(path.join(fixture, 'packages', pkg, 'src'), { recursive: true });
      await write(`packages/${pkg}/tsconfig.json`, JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }));
    }
    // Local workspace links exercise actual package exports instead of alias substitutes.
    for (const pkg of ['web', 'core']) {
      await write(`packages/${pkg}/package.json`, JSON.stringify({ name: `@originos/${pkg}`, exports: { '.': pkg === 'web' ? './src/components/ui/target.ts' : './src/index.ts' } }));
      await fs.mkdir(path.join(fixture, 'packages/core/node_modules/@originos'), { recursive: true });
      await fs.symlink(path.join(fixture, 'packages', pkg), path.join(fixture, 'packages/core/node_modules/@originos', pkg), 'dir');
    }
    await fs.mkdir(path.join(fixture, 'packages/web/node_modules/@originos'), { recursive: true });
    await fs.symlink(path.join(fixture, 'packages/core'), path.join(fixture, 'packages/web/node_modules/@originos/core'), 'dir');
    const targets = ['web/src/components/ui', 'web/src/components/os', 'web/src/components/interview', 'web/src/app', 'desktop/src/main', 'core/src/lib/features/example', 'core/src/modules/example', 'core/src/lib/storage', 'core/src/lib/shared'];
    for (const target of targets) await write(`packages/${target}/target.ts`);
    await write('packages/core/src/index.ts');

    const cases = [];
    function add(source, target, invalid = true, specifier, syntax = 'import') {
      const file = `packages/${source}/case-${cases.length}.ts`;
      const relative = path.relative(path.dirname(file), `packages/${target}/target.ts`).replace(/\.ts$/, '');
      const spec = JSON.stringify(specifier || (relative.startsWith('.') ? relative : `./${relative}`));
      const code = syntax === 'type' ? `import type { Value } from ${spec};`
        : syntax === 'export' ? `export { value } from ${spec};`
          : syntax === 'dynamic' ? `const value = import(${spec});` : `import { value } from ${spec};`;
      cases.push({ file, code, invalid });
    }
    for (const source of ['web/src/services', 'web/src/store']) {
      for (const target of ['web/src/components/ui', 'web/src/app']) add(source, target);
    }
    for (const source of ['web/src/components/ui', 'web/src/components/molecules']) add(source, 'web/src/components/os');
    for (const source of ['core/src/lib/features/example', 'core/src/modules/example', 'core/src/components']) {
      for (const target of ['web/src/components/ui', 'desktop/src/main']) add(source, target);
    }
    for (const source of ['storage', 'shared', 'integrations']) {
      for (const target of ['lib/features/example', 'modules/example']) add(`core/src/lib/${source}`, `core/src/${target}`);
    }
    for (const target of ['lib/features/example', 'modules/example']) add('core/src/types', `core/src/${target}`);
    for (const pkg of packages.filter((pkg) => pkg.startsWith('perception-plugins/'))) {
      for (const target of ['web/src/components/ui', 'desktop/src/main']) add(`${pkg}/src`, target);
    }
    add('web/src/components/ui', 'web/src/components/interview');
    add('web/src/components/interview', 'web/src/components/ui', false);
    add('desktop/src/main', 'web/src/components/ui');
    add('web/src/components/os', 'web/src/app');
    add('web/src/services', 'desktop/src/main');
    add('web/src/services', 'web/src/components/ui', true, '@/components/ui/target');
    add('core/src/lib/storage', 'core/src/lib/features/example', true, '@/lib/features/example/target');
    add('core/src/lib/features/example', 'web/src/components/ui', true, '@originos/web');
    for (const syntax of ['type', 'export', 'dynamic']) add('web/src/services', 'web/src/components/ui', true, '@/components/ui/target', syntax);
    add('web/src/app', 'core/src/lib/shared', false, '@originos/core');
    add('core/src/lib/features/example', 'core/src/lib/storage', false);
    add('core/src/lib/features/example', 'core/src/lib/shared', false, '@/lib/shared/target');
    add('web/src/components/os', 'web/src/components/ui', false);
    for (const item of cases) await write(item.file, item.code);
    const cfg = require(path.join(fixture, '.eslintrc.cjs'));
    let previous;
    for (const directory of [fixture, path.join(fixture, 'packages/web')]) {
      process.chdir(directory);
      const results = await checker(fixture, cfg, { 'import/no-unresolved': 'error' }).lintFiles(cases.map((item) => path.join(fixture, item.file)));
      for (const [index, result] of results.entries()) {
        assert.equal(result.messages.filter((message) => message.ruleId !== rule).length, 0, JSON.stringify(result));
        assert.equal(result.errorCount, Number(cases[index].invalid), JSON.stringify({ item: cases[index], result }));
      }
      const signature = results.map((result) => result.messages);
      if (previous) assert.deepEqual(signature, previous);
      previous = signature;
      // Also exercise normal config discovery and warning compatibility from both CWDs.
      const normal = new ESLint({ cwd: directory, resolvePluginsRelativeTo: root });
      const [result] = await normal.lintFiles([path.join(fixture, cases[0].file)]);
      assert.equal(result.messages.filter((message) => message.ruleId === rule && message.severity === 1).length, 1);
    }
    for (const dir of excluded) await write(`packages/web/src/${dir}/bad.ts`, 'invalid source !');
    for (const file of ['bad.test.ts', 'bad.spec.tsx', 'bad.test.mts', 'bad.d.ts', 'bad.d.mts']) await write(`packages/web/src/${file}`, 'invalid source !');
    const scanned = await sourceFiles(fixture);
    assert(!scanned.some((file) => path.basename(file).startsWith('bad')));
    assert(scanned.some((file) => file.endsWith('case-0.ts')));
    const run = () => spawnSync(process.execPath, [path.join(fixture, 'scripts/check-architecture-boundaries.cjs')], { cwd: fixture, encoding: 'utf8' });
    const violation = run();
    assert.equal(violation.status, 1, violation.stderr);
    assert(violation.stdout.includes('case-0.ts:1:'));
    assert(violation.stdout.includes(rule));
    for (const pkg of packages) await fs.rm(path.join(fixture, 'packages', pkg, 'src'), { recursive: true });
    for (const pkg of packages) await fs.mkdir(path.join(fixture, 'packages', pkg, 'src'));
    await write('packages/core/src/index.ts');
    const clean = run();
    assert.equal(clean.status, 0, clean.stderr);
    assert(clean.stdout.includes('0 条诊断'));
    await fs.unlink(path.join(fixture, 'packages/core/src/index.ts'));
    const empty = run();
    assert.equal(empty.status, 1);
    assert(empty.stderr.includes('扫描集合为空'));
    await write('.eslintrc.cjs', 'module.exports = { broken: ;');
    const invalid = run();
    assert.notEqual(invalid.status, 0);
    assert(invalid.stderr.includes('SyntaxError'));
    console.log(`架构自测通过：${cases.length} 个导入用例 × 2 个 CWD；正式配置 warning、扫描排除、合法/违规退出、空扫描与非法配置均通过。`);
  } finally {
    process.chdir(cwd);
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv[2] === '--self-test' && process.argv.length === 3) return selfTest();
  if (process.argv.length !== 2) throw new Error('用法：node scripts/check-architecture-boundaries.cjs [--self-test]');
  const files = await sourceFiles(root);
  const results = await checker(root, config).lintFiles(files);
  let errors = 0;
  for (const result of results) {
    for (const message of result.messages) {
      console.log(`${path.relative(root, result.filePath)}:${message.line || 1}:${message.column || 1} ${message.ruleId || 'parse/config'} ${message.message}`);
      errors++;
    }
  }
  console.log(`架构扫描：${files.length} 个生产文件，${errors} 条诊断。范围：Web/Core/Desktop/四个平台插件。`);
  console.log('静态分析限制：无法判定动态计算的 import 目标；未覆盖跨 feature 私有导入与循环依赖。');
  if (errors) process.exitCode = 1;
}
main().catch((error) => {
  console.error(`架构检查失败：${error.message}`);
  process.exitCode = 1;
});
