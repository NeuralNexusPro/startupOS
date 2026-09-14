import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../verify-windows-package.js');
const source = fs.readFileSync(script, 'utf8');
const schedule = 'dist-electron/core/src/lib/features/agent/tools/schedule-tools.js';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const modules = [
  'lib/paths', 'lib/integrations/pi-agent/display-content', 'lib/integrations/pi-agent/core/agent',
  'lib/integrations/pi-agent/tools/index', 'lib/integrations/pi-agent/tools/loop-detector',
  'lib/features/skills/service', 'lib/features/services/launcher/skill', 'lib/integrations/electron/workspace-paths',
].map(p => `dist-electron/core/src/${p}.js`).concat(schedule, [
  'services/workspace-service', 'services/entry-export-service', 'main',
].map(p => `dist-electron/desktop/src/main/${p}.js`));
const deps = ['@anthropic-ai/sdk', '@aws-sdk/client-bedrock-runtime', '@google/genai', '@mistralai/mistralai', '@opentelemetry/api', '@smithy/node-http-handler', 'http-proxy-agent', 'https-proxy-agent', 'openai', '@larksuiteoapi/node-sdk', '@wecom/aibot-node-sdk', 'imapflow', 'mailparser', ...['email', 'wecom', 'feishu', 'dingtalk'].map(p => `@originos/perception-plugin-${p}`)];
const workerFiles = ['agent-worker.mjs', 'agent-worker-module-specifier.mjs', 'core/lib/integrations/pi-agent/tools/loop-detector.js'].map(p => `agent-worker/${p}`);
const resources = ['web/packages/web/server.js', 'web/packages/web/node_modules/next/dist/server/next.js', 'web/packages/web/node_modules/styled-jsx/package.json', ...workerFiles,
  ...['onnxruntime_binding.node', 'onnxruntime.dll'].map(p => `app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/${p}`)];
function write(root, name, text = '') { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); }
function zip(names) {
  const headers = names.map(name => { const text = Buffer.from(name); const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50); header.writeUInt16LE(text.length, 28); return Buffer.concat([header, text]); });
  const directory = Buffer.concat(headers); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12); return Buffer.concat([directory, end]);
}
async function fixture({ missingSchedule = false, omitWorker = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'win-verification-')); roots.push(root);
  const payload = path.join(root, 'payload'); const resourceRoot = path.join(root, 'release/win-unpacked/resources');
  for (const entry of modules) if (!missingSchedule || entry !== schedule) write(payload, entry, 'getBundledSkillDirs materializeBundledSkill loadSkillFromDirectory');
  for (const entry of deps) write(payload, `node_modules/${entry}/package.json`, '{}');
  for (const entry of ['index.js', 'ai.js', 'goal.js', 'dist/index.cjs', 'dist/ai.cjs', 'dist/goal.cjs']) write(payload, `node_modules/@originos/pi-agent-adapter/${entry}`);
  write(payload, 'node_modules/archiver/index.js');
  fs.mkdirSync(resourceRoot, { recursive: true });
  await asar.createPackage(payload, path.join(resourceRoot, 'app.asar'));
  for (const entry of resources) if (!omitWorker || entry !== workerFiles[0]) write(resourceRoot, entry);
  write(root, 'release/fixture.zip', zip(['resources/app.asar', ...resources.filter(p => !omitWorker || p !== workerFiles[0]).map(p => `resources/${p}`)]));
  const errors = []; const resolved = [];
  const fakeProcess = { env: { WINDOWS_ZIP_PATH: path.join(root, 'release/fixture.zip') }, execPath: process.execPath };
  // Stub unrelated provider/API execution; real ASAR enumeration, extraction,
  // module presence, filesystem resources and ZIP checks remain under test.
  const runtimeRequire = request => {
    if (request.endsWith('workspace-paths.js')) return { resolveWorkspaceBasePath: () => 'C:\\Users\\admin\\AppData\\Roaming\\@originos\\desktop\\data\\agents\\release-smoke' };
    if (request.endsWith('/goal')) return () => {};
    return { Agent: () => {}, streamSimple: () => {}, completeSimple: () => {}, ZipArchive: () => {}, plugin: { manifest: { id: 'fixture' } } };
  };
  runtimeRequire.resolve = request => { resolved.push(request); if (path.isAbsolute(request) && !fs.existsSync(request)) throw Error(`missing module: ${request}`); return request; };
  const module = { exports: {} };
  const sandbox = { module, __dirname: path.join(root, 'packages/desktop/scripts'), process: fakeProcess,
    console: { error: text => errors.push(text), log: () => {}, warn: () => {} }, Buffer,
    require: name => {
      if (name.endsWith('/package.json')) return { version: 'fixture' };
      if (name === 'node:fs') return { ...fs, readdirSync: target => String(target).endsWith('templates/skills') ? [] : fs.readdirSync(target), mkdtempSync: prefix => { const dir = fs.mkdtempSync(prefix); roots.push(dir); return dir; } };
      if (name === 'node:child_process') return { execFileSync: () => '' };
      if (name === 'node:module') return { createRequire: () => runtimeRequire };
      if (name === './verify-pi-task-runtime-package.js') return { verifyAsarRuntime: async () => ({ hash: 'fixture', platform: 'windows-x64' }) };
      return require(name);
    },
  };
  vm.runInNewContext(source, sandbox, { filename: script });
  return { ...module.exports, errors, resolved, fakeProcess };
}
describe('Windows business tool packaging verification', () => {
  it('accepts the ASAR business module without any external schedule copy and resolves the new module', async () => {
    const x = await fixture(); await x.verifyAsar(); x.verifyResources(); x.verifyWindowsZip();
    expect(x.errors).toEqual([]); expect(x.fakeProcess.exitCode).toBeUndefined();
    expect(x.resolved.some(p => p.endsWith(schedule))).toBe(true);
  });
  it('rejects a package missing the real ASAR schedule module', async () => {
    const x = await fixture({ missingSchedule: true }); await x.verifyAsar();
    expect(x.fakeProcess.exitCode).toBe(1); expect(x.errors).toContain(`[verify-windows-package] app.asar missing ${schedule}`);
  });
  it('still rejects missing external worker files in resources and ZIP', async () => {
    const x = await fixture({ omitWorker: true }); x.verifyResources(); x.verifyWindowsZip();
    expect(x.fakeProcess.exitCode).toBe(1); expect(x.errors).toHaveLength(2);
    expect(x.errors.every(e => e.includes('agent-worker/agent-worker.mjs'))).toBe(true);
  });
});
