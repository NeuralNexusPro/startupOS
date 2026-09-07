export interface FeishuSdkMessageEvent {
  event_id?: string;
  create_time?: string;
  tenant_key?: string;
  sender: { sender_id?: { open_id?: string; user_id?: string }; sender_type: string };
  message: {
    message_id: string; chat_id: string; chat_type: string; message_type: string; content: string; create_time: string;
    mentions?: Array<{ id: { open_id?: string; user_id?: string }; name: string }>;
  };
}

export interface FeishuEventDispatcher {
  register(handlers: { 'im.message.receive_v1'?: (event: FeishuSdkMessageEvent) => Promise<void> | void }): FeishuEventDispatcher;
}
export interface FeishuWsClient { start(input: { eventDispatcher: FeishuEventDispatcher }): Promise<void>; close(input?: { force?: boolean }): void }
export interface FeishuMarkdownStreamController {
  append(chunk: string): Promise<void>;
  setContent(content: string): Promise<void>;
}
export interface FeishuApiClient {
  replyText(messageId: string, chatId: string, content: string): Promise<{ messageId: string }>;
  replyMarkdown(messageId: string, chatId: string, content: string): Promise<{ messageId: string }>;
  streamReply(messageId: string, chatId: string, producer: (controller: FeishuMarkdownStreamController) => Promise<void>): Promise<{ messageId: string }>;
}
export interface FeishuSdkRuntime { ws: FeishuWsClient; dispatcher: FeishuEventDispatcher; api: FeishuApiClient }
export interface FeishuSdkFactoryOptions {
  appId: string; appSecret: string; domain: 'feishu' | 'lark';
  onReady(): void; onError(error: Error): void; onReconnecting(): void; onReconnected(): void;
}
export type FeishuSdkFactory = (options: FeishuSdkFactoryOptions) => FeishuSdkRuntime;
