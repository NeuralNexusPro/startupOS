export interface WeComFrameBody {
  msgid?: string;
  aibotid?: string;
  chatid?: string;
  chattype?: 'single' | 'group';
  from?: { userid?: string };
  create_time?: number;
  text?: { content?: string };
  voice?: { content?: string };
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
  connect(): unknown;
  disconnect(): void;
  replyStream(frame: WeComFrame, streamId: string, content: string, finish: boolean): Promise<unknown>;
  on(event: string, listener: (payload?: unknown) => void): unknown;
}

export type WeComBotClientFactory = (options: {
  botId: string;
  secret: string;
  wsUrl?: string;
}) => WeComBotClient;
