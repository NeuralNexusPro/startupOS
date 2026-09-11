#!/usr/bin/env node
// Exercises the compiled business entry and real worker in a fresh process, without a model request.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function verifyTools(coreRoot) {
  const directory = process.env.DATA_ROOT;
  const business = require(path.join(coreRoot, 'lib/features/agent/server/index.js'));
  // No initialization here until the cold worker's existing registry is checked.
  const names = business.getToolRegistry().getAll().map(tool => tool.name);
  for (const name of ['read_document', 'create_domain', 'create_instance', 'schedule_task']) assert(names.includes(name), name);
  business.initializeBuiltInTools();
  assert.deepEqual(business.getToolRegistry().getAll().map(tool => tool.name), names);
  business.getToolContextManager().setDefaultContext({ workingDirectory: directory });
  fs.writeFileSync(path.join(directory, 'smoke.md'), '# packaged business tool');
  const read = business.getToolRegistry().getAll().find(tool => tool.name === 'read_document');
  const result = await read.execute('packaged-read', { filePath: 'smoke.md' });
  assert(result.content.some(part => part.type === 'text' && part.text.includes('packaged business tool')));
  const denied = await read.execute('packaged-denied', { filePath: '../outside.md' });
  assert.equal(denied.details.error, true);
  process.stdout.write(`${JSON.stringify({ type: 'business-smoke', count: names.length })}\n`);
}

async function child(coreRoot) {
  await import(pathToFileURL(path.join(process.env.ORIGINOS_AGENT_WORKER_DIR, 'agent-worker.mjs')).href);
  const write = process.stdout.write.bind(process.stdout);
  let checked = false;
  process.stdout.write = (chunk, ...rest) => {
    const result = write(chunk, ...rest);
    if (!checked && String(chunk).trim() === '{"type":"ready"}') {
      checked = true;
      verifyTools(coreRoot).then(() => {
        process.stdin.emit('data', '{"type":"shutdown"}\n');
      }).catch(error => { console.error(error); process.exit(1); });
    }
    return result;
  };
  // Drive the actual worker JSON-line reader. It must register tools itself before ready.
  process.stdin.emit('data', `${JSON.stringify({ type: 'initialize', config: {
    projectId: 'smoke-project', agentId: 'smoke-agent', agentType: process.argv[4], workingDirectory: process.env.DATA_ROOT,
    systemPrompt: 'Local cold-start verification; do not contact a model.',
    model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'local-smoke-only' },
  } })}\n`);
}

if (process.argv[2] === '--child') {
  child(process.argv[3]).catch(error => { console.error(error); process.exit(1); });
} else {
  const coreRoot = path.resolve(process.argv[2] || path.join(__dirname, '../../../dist-electron/core/src'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-worker-business-'));
  try {
    const workerDir = path.join(directory, 'agent-worker');
    const files = {
      'modules/collaboration-runtime/sandbox/agent-worker.mjs': 'agent-worker.mjs',
      'modules/collaboration-runtime/sandbox/agent-worker-module-specifier.mjs': 'agent-worker-module-specifier.mjs',
      'lib/paths.js': 'lib/paths.js',
      'lib/integrations/pi-agent/display-content.js': 'lib/display-content.js',
      'modules/collaboration-runtime/sandbox/cognitive-session-end.js': 'cognitive-session-end.js',
    };
    for (const [source, target] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(workerDir, target)), { recursive: true });
      fs.copyFileSync(path.join(coreRoot, source), path.join(workerDir, target));
    }
    for (const agentType of ['skill', 'persistent']) {
    const result = spawnSync(process.execPath, [__filename, '--child', coreRoot, agentType], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, DATA_ROOT: directory, ELECTRON_RUN_AS_NODE: '1', ANTHROPIC_API_KEY: 'local-smoke-only',
        ORIGINOS_CORE_SRC_DIR: coreRoot, ORIGINOS_AGENT_WORKER_DIR: workerDir },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const messages = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert(messages.some(message => message.type === 'business-smoke'));
    assert(messages.some(message => message.type === 'ready'), `worker did not initialize: ${result.stderr}`);
    assert(!messages.some(message => message.type === 'error'), JSON.stringify(messages));
    console.log(`[verify-agent-business-runtime] ${agentType}: compiled tools, path authorization, worker cold start and shutdown passed`);
    }
    assert(fs.existsSync(path.join(directory, 'projects/smoke-project/sessions/persistent-smoke-project.json')), 'persistent worker must save its session');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
