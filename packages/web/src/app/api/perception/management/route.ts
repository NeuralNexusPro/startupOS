import { NextRequest, NextResponse } from 'next/server';

import {
  getPerceptionDashboard,
  replayPerceptionDeadLetter,
  savePerceptionConnector,
  savePerceptionGrant,
  savePerceptionRule,
  setPerceptionConnectorEnabled,
} from '@/services/perceptionManagementService';
import type { ExternalTriggerGrant, PerceptionConnectorConfig, PerceptionTriggerRule } from '@originos/core/types';

interface ManagementAction {
  action?: string; id?: string; connectorId?: string; enabled?: boolean;
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
      return NextResponse.json({ success: true, data: savePerceptionConnector(body.connector) });
    }
    if (body.action === 'save-rule' && body.rule) {
      return NextResponse.json({ success: true, data: savePerceptionRule(body.rule) });
    }
    if (body.action === 'save-grant' && body.grant) {
      return NextResponse.json({ success: true, data: savePerceptionGrant(body.grant) });
    }
    return NextResponse.json({ success: false, error: { code: 'INVALID_ACTION' } }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, error: { code: 'MANAGEMENT_ACTION_FAILED' } }, { status: 409 });
  }
}
