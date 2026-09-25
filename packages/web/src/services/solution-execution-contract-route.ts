import { NextRequest, NextResponse } from 'next/server';

import {
  createSolutionExecutionContractPublishingService,
  mapPublishingError,
  parseRevokeBody,
  validateRouteParams,
  validateTransportActor,
  type SolutionContractRouteParams,
} from './solution-execution-contract-server';

import type {
  SolutionContractCheckResponse,
  SolutionContractPublishResponse,
  SolutionContractReadResponse,
  SolutionContractRevokeResponse,
  SolutionContractTransportResponse,
} from './solution-execution-contract-contract';

export interface SolutionContractNextParams {
  readonly params: Promise<{
    readonly id: string;
    readonly solutionId: string;
    readonly version: string;
  }>;
}

function failure(
  error: NonNullable<ReturnType<typeof validateRouteParams>>,
  status: number
): NextResponse {
  const response: SolutionContractTransportResponse<never> = {
    success: false,
    error,
  };
  return NextResponse.json(response, { status });
}

async function requestContext(
  request: NextRequest,
  context: SolutionContractNextParams
): Promise<
  | { readonly ok: true; readonly ref: SolutionContractRouteParams }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const actorError = validateTransportActor(
    request.headers.get('x-originos-actor-id')
  );
  if (actorError) {
    return { ok: false, response: failure(actorError, 401) };
  }
  const params = await context.params;
  const ref: SolutionContractRouteParams = {
    projectId: params.id,
    solutionId: params.solutionId,
    solutionVersion: params.version,
  };
  const parameterError = validateRouteParams(ref);
  if (parameterError) {
    return { ok: false, response: failure(parameterError, 400) };
  }
  return { ok: true, ref };
}

function coreFailure(error: unknown): NextResponse {
  const mapped = mapPublishingError(error);
  return NextResponse.json(mapped.response, { status: mapped.status });
}

export async function checkSolutionContractRoute(
  request: NextRequest,
  context: SolutionContractNextParams
): Promise<NextResponse> {
  const resolved = await requestContext(request, context);
  if (!resolved.ok) {
    return resolved.response;
  }
  try {
    const data = await createSolutionExecutionContractPublishingService().check(
      resolved.ref
    );
    const response: SolutionContractCheckResponse = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return coreFailure(error);
  }
}

export async function publishSolutionContractRoute(
  request: NextRequest,
  context: SolutionContractNextParams
): Promise<NextResponse> {
  const resolved = await requestContext(request, context);
  if (!resolved.ok) {
    return resolved.response;
  }
  try {
    const data =
      await createSolutionExecutionContractPublishingService().publish(
        resolved.ref
      );
    const response: SolutionContractPublishResponse = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return coreFailure(error);
  }
}

export async function readSolutionContractRoute(
  request: NextRequest,
  context: SolutionContractNextParams
): Promise<NextResponse> {
  const resolved = await requestContext(request, context);
  if (!resolved.ok) {
    return resolved.response;
  }
  try {
    const data = await createSolutionExecutionContractPublishingService().read(
      resolved.ref
    );
    const response: SolutionContractReadResponse = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return coreFailure(error);
  }
}

export async function revokeSolutionContractRoute(
  request: NextRequest,
  context: SolutionContractNextParams
): Promise<NextResponse> {
  const resolved = await requestContext(request, context);
  if (!resolved.ok) {
    return resolved.response;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(
      {
        category: 'validation',
        code: 'INVALID_JSON',
        message: '请求正文不是有效 JSON',
        retryable: false,
      },
      400
    );
  }
  const parsed = parseRevokeBody(body);
  if (!parsed.ok) {
    return failure(parsed.error, 400);
  }
  try {
    const data =
      await createSolutionExecutionContractPublishingService().revoke({
        ...resolved.ref,
        ...parsed.value,
      });
    const response: SolutionContractRevokeResponse = { success: true, data };
    return NextResponse.json(response);
  } catch (error) {
    return coreFailure(error);
  }
}
