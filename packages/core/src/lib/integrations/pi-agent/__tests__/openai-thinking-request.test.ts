// @vitest-environment node

import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const nodeRequire = createRequire(import.meta.url);

describe('OpenAI-compatible thinking request mapping', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  });

  it('sends minimal reasoning effort for an enterprise GLM alias when thinking is off', async () => {
    const { streamSimple } = nodeRequire('@originos/pi-agent-adapter/ai') as typeof import('@originos/pi-agent-adapter/ai');
    const { createOpenAICompatibleModel } = await import('../server-config.js');
    let requestBody = '';
    server = createServer((request, response) => {
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        requestBody += chunk;
      });
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: [DONE]\n\n');
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');

    const model = createOpenAICompatibleModel('ep-cl-glm', {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'test-key',
    });
    const stream = streamSimple(model, {
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'test' }],
        timestamp: Date.now(),
      }],
    }, { apiKey: 'test-key' });

    // Consuming the stream starts the lazy provider request. The deliberately
    // minimal SSE response may end as an adapter error; only the captured JSON
    // request is under test here.
    let providerError: string | undefined;
    for await (const event of stream) {
      if (event.type === 'error') providerError = event.error.errorMessage;
    }

    expect(requestBody, providerError ?? 'provider request was not sent').not.toBe('');
    const payload = JSON.parse(requestBody) as Record<string, unknown>;
    expect(payload.thinking).toBeUndefined();
    expect(payload.reasoning_effort).toBe('minimal');
  });

  it('sends the Z.AI disabled thinking field for a native GLM model', async () => {
    const { streamSimple } = nodeRequire('@originos/pi-agent-adapter/ai') as typeof import('@originos/pi-agent-adapter/ai');
    const { createOpenAICompatibleModel } = await import('../server-config.js');
    let requestBody = '';
    server = createServer((request, response) => {
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        requestBody += chunk;
      });
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: [DONE]\n\n');
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');

    const model = createOpenAICompatibleModel('glm-4.5', {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'test-key',
    });
    const stream = streamSimple(model, {
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'test' }],
        timestamp: Date.now(),
      }],
    }, { apiKey: 'test-key' });
    for await (const event of stream) {
      if (event.type === 'error') break;
    }

    const payload = JSON.parse(requestBody) as Record<string, unknown>;
    expect(payload.thinking).toEqual({ type: 'disabled' });
    expect(payload.reasoning_effort).toBeUndefined();
  });
});
