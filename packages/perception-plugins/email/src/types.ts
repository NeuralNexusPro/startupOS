export type MailAuthMode = 'password' | 'oauth2-token';

export interface MailConnectorSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  authMode: MailAuthMode;
  mailbox: string;
  pollIntervalSeconds: number;
}

export interface MailSecret {
  kind: MailAuthMode;
  value: string;
}
