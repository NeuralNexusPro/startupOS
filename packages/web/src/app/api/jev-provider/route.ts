import { NextResponse } from 'next/server';
import { getDataRoot } from '@originos/core/lib/paths';
import {
  JevProviderConfigError,
  JevProviderConfigService,
  type JevProviderUpdate,
} from '@originos/core/lib/features/perception';

const MAX_BODY_BYTES = 20_000;
function provider(): JevProviderConfigService {
  return new JevProviderConfigService(getDataRoot(), {
    environment: process.env['NODE_ENV'] === 'development' ? 'development' : 'production',
    allowDevelopmentLoopback: process.env['ORIGINOS_ALLOW_JEV_LOOPBACK'] === '1',
  });
}
function response(action: () => unknown | Promise<unknown>) {
  return Promise.resolve().then(action)
    .then((data) => NextResponse.json({ success: true, data, timestamp: new Date().toISOString() }))
    .catch((error: unknown) => {
      const code = error instanceof JevProviderConfigError ? error.code : error instanceof Error && error.message === 'JEV_INVALID_BASE_URL' ? 'JEV_INVALID_BASE_URL' : 'INTERNAL_ERROR';
      return NextResponse.json({ success: false, error: { code, message: code }, timestamp: new Date().toISOString() }, { status: code === 'INTERNAL_ERROR' ? 500 : 400 });
    });
}
async function json(request: Request): Promise<unknown> {
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
  try { return JSON.parse(body) as unknown; }
  catch { throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG'); }
}

export async function GET() { return response(() => provider().getSummary()); }
export async function PUT(request: Request) { return response(async () => provider().update(await json(request) as JevProviderUpdate)); }
export async function DELETE(request: Request) {
  return response(async () => {
    const body = await json(request) as { confirm?: unknown };
    if (body.confirm !== true) throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
    return provider().clearCredential();
  });
}
