import type { JsonValue } from '../../../../types/perception';

export interface DingTalkStreamHeaders {
  appId?: string;
  connectionId?: string;
  contentType?: string;
  messageId?: string;
  time?: string;
  topic?: string;
}

export interface DingTalkStreamFrame {
  specVersion: string;
  type: 'EVENT' | 'CALLBACK';
  headers: DingTalkStreamHeaders;
  data: string | { [key: string]: JsonValue };
}

export type DingTalkStreamAckStatus = 'SUCCESS' | 'LATER';
export interface DingTalkStreamAck { status: DingTalkStreamAckStatus; message?: string }

export interface DingTalkStreamClientPort {
  start(onFrame: (frame: DingTalkStreamFrame) => Promise<DingTalkStreamAck>): Promise<void>;
  stop(): Promise<void>;
}
