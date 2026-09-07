'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

async function importRuntime(packageName) {
  return import(packageName);
}

function createContext(execute) {
  return {
    systemPrompt: 'runtime patch contract',
    messages: [],
    tools: [{
      name: 'contract_tool',
      label: 'Contract Tool',
      description: 'Runtime patch contract tool',
      parameters: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      execute,
    }],
  };
}

test('host invocation uses schema, hooks, updates, and paired lifecycle events', async () => {
  const runtime = await importRuntime('@earendil-works/pi-agent-core');
  assert.equal(typeof runtime.invokeRegisteredToolCall, 'function');

  const events = [];
  const hooks = [];
  const result = await runtime.invokeRegisteredToolCall(
    createContext(async (_id, args, _signal, update) => {
      update({ content: [{ type: 'text', text: 'partial' }], details: {} });
      return { content: [{ type: 'text', text: args.value }], details: { source: 'tool' } };
    }),
    {
      toolCallId: 'host-contract-1',
      toolName: 'contract_tool',
      input: { value: 'ok' },
    },
    {
      beforeToolCall: async ({ args }) => {
        hooks.push(`before:${args.value}`);
      },
      afterToolCall: async ({ result: toolResult }) => {
        hooks.push(`after:${toolResult.details.source}`);
        return { details: { source: 'after-hook' } };
      },
      toolExecution: 'sequential',
    },
    new AbortController().signal,
    async (event) => {
      events.push(event);
    },
  );

  assert.equal(result.isError, false);
  assert.deepEqual(hooks, ['before:ok', 'after:tool']);
  assert.deepEqual(events.map((event) => event.type), [
    'tool_execution_start',
    'tool_execution_update',
    'tool_execution_end',
  ]);
  assert.equal(events[2].result.details.source, 'after-hook');
  assert.equal(events.some((event) => event.type.startsWith('message_')), false);
  assert.equal(events.some((event) => event.type.startsWith('turn_')), false);
  assert.equal(events.some((event) => event.type.startsWith('agent_')), false);
});

test('schema and permission failures do not execute the tool and still emit end', async () => {
  const runtime = await importRuntime('@earendil-works/pi-agent-core');
  let executions = 0;
  const context = createContext(async () => {
    executions += 1;
    return { content: [], details: {} };
  });

  for (const contractCase of [
    {
      id: 'invalid-schema',
      input: {},
      beforeToolCall: undefined,
    },
    {
      id: 'blocked',
      input: { value: 'blocked' },
      beforeToolCall: async () => ({ block: true, reason: 'permission denied' }),
    },
  ]) {
    const events = [];
    const result = await runtime.invokeRegisteredToolCall(
      context,
      {
        toolCallId: contractCase.id,
        toolName: 'contract_tool',
        input: contractCase.input,
      },
      {
        beforeToolCall: contractCase.beforeToolCall,
        toolExecution: 'sequential',
      },
      new AbortController().signal,
      async (event) => {
        events.push(event);
      },
    );

    assert.equal(result.isError, true);
    assert.deepEqual(events.map((event) => event.type), [
      'tool_execution_start',
      'tool_execution_end',
    ]);
  }

  assert.equal(executions, 0);
});

test('coding AgentSession exposes the public host invocation method', async () => {
  const runtime = await importRuntime('@earendil-works/pi-coding-agent');
  assert.equal(typeof runtime.AgentSession.prototype.invokeRegisteredTool, 'function');
});
