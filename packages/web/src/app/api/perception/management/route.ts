import { NextRequest, NextResponse } from 'next/server';

import {
  getPerceptionDashboard,
  replayPerceptionDeadLetter,
  savePerceptionConnector,
  savePerceptionGrant,
  deletePerceptionGrant,
  deletePerceptionRule,
  savePerceptionRule,
  setPerceptionConnectorEnabled,
} from '@/services/perceptionManagementService';
import type { ExternalTriggerGrant, PerceptionConnectorConfig, PerceptionTriggerRule } from '@originos/core/types';

interface ManagementAction {
  action?: string; id?: string; connectorId?: string; enabled?: boolean; kind?: ExternalTriggerGrant['target']['kind'];
  connector?: PerceptionConnectorConfig; rule?: PerceptionTriggerRule; grant?: ExternalTriggerGrant;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ success: true, data: getPerceptionDashboard() });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: ManagementAction;
  try {
    body = await request.json() as ManagementAction;
  } catch {
    return NextResponse.json({ success: false, error: { code: 'INVALID_PAYLOAD' } }, { status: 400 });
  }
  try {
    if (body.action === 'set-connector-enabled' && body.id && typeof body.enabled === 'boolean') {
      return NextResponse.json({ success: true, data: setPerceptionConnectorEnabled(body.id, body.enabled) });
    }
    if (body.action === 'replay-dead-letter' && body.connectorId && body.id) {
      return NextResponse.json({ success: true, data: replayPerceptionDeadLetter(body.connectorId, body.id) });
    }
    if (body.action === 'save-connector' && body.connector) {
      if (containsCredential(body.connector)) {
        return NextResponse.json({ success: false, error: { code: 'CREDENTIAL_NOT_ALLOWED' } }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: savePerceptionConnector(body.connector) });
    }
    if (body.action === 'save-rule' && body.rule) {
      return NextResponse.json({ success: true, data: savePerceptionRule(body.rule) });
    }
    if (body.action === 'delete-rule' && body.id) {
      return NextResponse.json({ success: true, data: deletePerceptionRule(body.id) });
    }
    if (body.action === 'save-grant' && body.grant) {
      return NextResponse.json({ success: true, data: savePerceptionGrant(body.grant) });
    }
    if (body.action === 'delete-grant' && body.kind && body.id) {
      return NextResponse.json({ success: true, data: deletePerceptionGrant(body.kind, body.id) });
    }
    return NextResponse.json({ success: false, error: { code: 'INVALID_ACTION' } }, { status: 400 });
  } catch (error) {
    const code = managementErrorCode(body.action, error);
    return NextResponse.json({ success: false, error: { code } }, { status: 409 });
  }
}

function managementErrorCode(action: string | undefined, error: unknown): string {
  if (action !== 'save-rule') return 'MANAGEMENT_ACTION_FAILED';
  if (error instanceof Error && error.message === 'Perception rule target is not authorized for external triggers') {
    return 'TARGET_NOT_AUTHORIZED';
  }
  return 'INVALID_TRIGGER_RULE';
}

function containsCredential(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredential);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    if (normalized !== 'secretref' && /(password|passwd|credential|accesstoken|refreshtoken|oauthtoken)/.test(normalized)) return true;
    return containsCredential(child);
  });
}
