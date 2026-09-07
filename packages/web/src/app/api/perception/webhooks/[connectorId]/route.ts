import { NextRequest, NextResponse } from 'next/server';

import { WebhookGatewayError } from '@originos/core/modules/perception-runtime';

import { handlePerceptionHandshake, handlePerceptionWebhook } from '@/services/perceptionWebhookService';

import type { JsonValue } from '@originos/core/modules/perception-runtime';

const MAX_CONTENT_LENGTH = 256 * 1024;

function headersToRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function queryToRecord(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

export async function GET(request: NextRequest, context: { params: { connectorId: string } }): Promise<NextResponse> {
  try {
    const ack = await handlePerceptionHandshake({
      connectorId: context.params.connectorId,
      query: queryToRecord(request.nextUrl),
    });
    if (typeof ack.body === 'string') {
      return new NextResponse(ack.body, { status: ack.status, headers: ack.headers });
    }
    return NextResponse.json(ack.body ?? { success: true }, { status: ack.status, headers: ack.headers });
  } catch (error) {
    if (error instanceof WebhookGatewayError) {
      return NextResponse.json({ success: false, error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { connectorId: string } }): Promise<NextResponse> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE' } }, { status: 413 });
  }

  let payload: JsonValue;
  let rawBody: string;
  try {
    rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE' } }, { status: 413 });
    }
    payload = parseWebhookPayload(rawBody, request.headers.get('content-type'));
  } catch {
    return NextResponse.json({ success: false, error: { code: 'INVALID_PAYLOAD' } }, { status: 400 });
  }

  try {
    const result = await handlePerceptionWebhook({
      connectorId: context.params.connectorId,
      payload,
      headers: headersToRecord(request.headers),
      query: queryToRecord(request.nextUrl),
      rawBody,
    });
    return NextResponse.json(result.ack.body ?? { success: true }, {
      status: result.ack.status,
      headers: result.ack.headers,
    });
  } catch (error) {
    if (error instanceof WebhookGatewayError) {
      return NextResponse.json({ success: false, error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

function parseWebhookPayload(rawBody: string, contentType: string | null): JsonValue {
  if (contentType?.toLowerCase().includes('xml') || rawBody.trimStart().startsWith('<')) {
    const match = /<Encrypt>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/Encrypt>/i.exec(rawBody);
    const encrypted = (match?.[1] ?? match?.[2])?.trim();
    if (!encrypted) throw new Error('Invalid WeCom XML envelope');
    return { Encrypt: encrypted };
  }
  return JSON.parse(rawBody) as JsonValue;
}
