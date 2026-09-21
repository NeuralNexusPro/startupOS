import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@originos/core/lib/paths', () => ({ getDataRoot: () => '/tmp/originos-jev-provider-route-test' }));

import { GET, PUT } from './route';

const originalApiKey = process.env['TYPESAFE_API_KEY'];
afterEach(() => {
  if (originalApiKey === undefined) delete process.env['TYPESAFE_API_KEY'];
  else process.env['TYPESAFE_API_KEY'] = originalApiKey;
});

describe('Jev Provider API route', () => {
  it('returns only the environment credential summary', async () => {
    process.env['TYPESAFE_API_KEY'] = 'route-secret-marker';
    const response = await GET();
    const body = await response.json();

    expect(body.data).toMatchObject({ credentialConfigured: true, credentialSource: 'environment' });
    expect(JSON.stringify(body)).not.toMatch(/route-secret-marker|secretRef|ciphertext/i);
  });

  it('rejects browser credential storage without echoing the key', async () => {
    delete process.env['TYPESAFE_API_KEY'];
    const response = await PUT(new Request('http://localhost/api/jev-provider', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', apiKey: 'route-secret-marker' }),
    }));
    const body = await response.json();

    expect(body).toMatchObject({ success: false, error: { code: 'SECURE_STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(body)).not.toContain('route-secret-marker');
  });
});
