export interface FeishuSecrets {
  verificationToken: string;
  encryptKey?: string;
}

export interface FeishuEncryptedEnvelope {
  encrypt: string;
}
