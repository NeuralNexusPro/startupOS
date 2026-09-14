export interface WeComSecrets {
  token: string;
  encodingAesKey: string;
  receiveId: string;
}

export interface WeComEncryptedEnvelope {
  Encrypt: string;
}

export interface WeComUrlVerificationRequest {
  msgSignature: string;
  timestamp: string;
  nonce: string;
  echoStr: string;
}
