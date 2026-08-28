export type WebhookGatewayErrorCode =
  | 'CONNECTOR_NOT_FOUND'
  | 'CONNECTOR_DISABLED'
  | 'UNAUTHORIZED'
  | 'REPLAY_WINDOW_EXPIRED'
  | 'REPLAY_DETECTED'
  | 'INVALID_PAYLOAD'
  | 'PAYLOAD_TOO_LARGE'
  | 'NORMALIZATION_FAILED';

const STATUS_BY_CODE: Record<WebhookGatewayErrorCode, number> = {
  CONNECTOR_NOT_FOUND: 404,
  CONNECTOR_DISABLED: 503,
  UNAUTHORIZED: 401,
  REPLAY_WINDOW_EXPIRED: 409,
  REPLAY_DETECTED: 409,
  INVALID_PAYLOAD: 400,
  PAYLOAD_TOO_LARGE: 413,
  NORMALIZATION_FAILED: 500,
};

export class WebhookGatewayError extends Error {
  readonly status: number;

  constructor(readonly code: WebhookGatewayErrorCode, message: string) {
    super(message);
    this.name = 'WebhookGatewayError';
    this.status = STATUS_BY_CODE[code];
  }
}

