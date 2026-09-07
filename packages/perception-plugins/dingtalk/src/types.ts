import type { JsonValue } from '@originos/core/types';

export interface DingTalkStreamFrame {
  specVersion: string;
  type: 'EVENT' | 'CALLBACK';
  headers: {
    appId?: string;
    connectionId?: string;
    contentType?: string;
    messageId?: string;
    time?: string;
    topic?: string;
  };
  data: string | { [key: string]: JsonValue };
}
