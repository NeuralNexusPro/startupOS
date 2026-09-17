import type { PluginLogPort } from '@originos/core/modules/perception-runtime/plugins';

export interface WeComFrameBody {
  msgid?: string;
  aibotid?: string;
  chatid?: string;
  chattype?: 'single' | 'group';
  from?: { userid?: string };
  create_time?: number;
  text?: { content?: string };
  voice?: { content?: string };
  file?: { url?: string; aeskey?: string };
}

export interface WeComFrame {
  headers?: { req_id?: string };
  body?: WeComFrameBody;
}

export interface WeComSettings {
  botId: string;
  websocketUrl?: string;
}

export interface WeComBotClient {
  downloadFile(url: string, aesKey?: string): Promise<{ buffer: Buffer; filename?: string }>;
  uploadMedia(bytes: Buffer, options: { type: 'file'; filename: string }): Promise<{ media_id: string }>;
  replyMedia(frame: WeComFrame, mediaType: 'file', mediaId: string): Promise<unknown>;
  connect(): unknown;
  disconnect(): void;
  replyStream(frame: WeComFrame, streamId: string, content: string, finish: boolean): Promise<unknown>;
  on(event: string, listener: (payload?: unknown) => void): unknown;
}

export type WeComBotClientFactory = (options: {
  botId: string;
  secret: string;
  wsUrl?: string;
  logger?: PluginLogPort['sdkLogger'];
}) => WeComBotClient;
