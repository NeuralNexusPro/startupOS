import type { ChannelReplyFile } from '@originos/core/modules/perception-runtime/plugins';

export interface DingTalkRecipient {
  robotCode: string;
  conversationId: string;
  conversationType: '1' | '2';
  senderStaffId?: string;
}

/** One client per connector; tokens and cancellation never cross connectors. */
export class DingTalkApi {
  private token?: { value: string; expires: number };
  private pendingToken?: Promise<string>;
  constructor(private readonly appId: string, private readonly secret: string, private readonly stopped: AbortSignal) {}

  private assertActive(signal?: AbortSignal): void {
    if (this.stopped.aborted || signal?.aborted) throw new Error('DINGTALK_SEND_CANCELLED');
  }

  private async request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Record<string, unknown>> {
    this.assertActive(signal);
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([this.stopped, ...(signal ? [signal] : []), AbortSignal.timeout(15_000)]) });
      if (!response.ok) throw new Error('DINGTALK_SEND_FAILED');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('DINGTALK_SEND_FAILED');
      this.assertActive(signal);
      return body as Record<string, unknown>;
    } catch {
      this.assertActive(signal);
      throw new Error('DINGTALK_SEND_FAILED');
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    if (!this.pendingToken) {
      this.pendingToken = this.request('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appKey: this.appId, appSecret: this.secret }),
      }).then(body => {
        if (typeof body.accessToken !== 'string' || !body.accessToken || typeof body.expireIn !== 'number' || body.expireIn <= 0) throw new Error('DINGTALK_SEND_FAILED');
        this.token = { value: body.accessToken, expires: Date.now() + Math.max(0, body.expireIn - 60) * 1000 };
        return body.accessToken;
      }).finally(() => { this.pendingToken = undefined; });
    }
    return this.pendingToken;
  }

  private async send(recipient: DingTalkRecipient, token: string, msgKey: string, parameters: Record<string, string>, signal?: AbortSignal): Promise<string> {
    this.assertActive(signal);
    if (recipient.conversationType === '1' && !recipient.senderStaffId) throw new Error('DINGTALK_RECIPIENT_INVALID');
    const destination = recipient.conversationType === '2' ? { openConversationId: recipient.conversationId } : { userIds: [recipient.senderStaffId] };
    const path = recipient.conversationType === '2' ? 'groupMessages/send' : 'oToMessages/batchSend';
    const result = await this.request(`https://api.dingtalk.com/v1.0/robot/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-acs-dingtalk-access-token': token },
      body: JSON.stringify({ robotCode: recipient.robotCode, ...destination, msgKey, msgParam: JSON.stringify(parameters) }),
    }, signal);
    if (typeof result.processQueryKey !== 'string' || !result.processQueryKey ||
      (Array.isArray(result.invalidStaffIdList) && result.invalidStaffIdList.length > 0) ||
      (Array.isArray(result.flowControlledStaffIdList) && result.flowControlledStaffIdList.length > 0)) throw new Error('DINGTALK_SEND_FAILED');
    return result.processQueryKey;
  }

  async sendText(recipient: DingTalkRecipient, content: string): Promise<string> {
    return this.send(recipient, await this.accessToken(), 'sampleText', { content });
  }

  async sendFile(recipient: DingTalkRecipient, file: ChannelReplyFile, signal?: AbortSignal): Promise<string> {
    this.assertActive(signal);
    const fileType = file.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!['xlsx', 'pdf', 'zip', 'rar', 'doc', 'docx'].includes(fileType)) throw new Error('IM_FILE_FORMAT_UNSUPPORTED');
    if (file.bytes.byteLength > 20_000_000) throw new Error('IM_FILE_TOO_LARGE');
    if (file.bytes.byteLength === 0 || /[\\/\u0000-\u001f]/.test(file.fileName)) throw new Error('DINGTALK_FILE_INVALID');
    const token = await this.accessToken();
    this.assertActive(signal);
    const body = new FormData();
    body.set('type', 'file');
    body.set('media', new Blob([new Uint8Array(file.bytes)], { type: 'application/octet-stream' }), file.fileName);
    const uploaded = await this.request(`https://oapi.dingtalk.com/media/upload?access_token=${encodeURIComponent(token)}`, { method: 'POST', body }, signal);
    if (uploaded.errcode !== 0 || typeof uploaded.media_id !== 'string' || !uploaded.media_id) throw new Error('DINGTALK_SEND_FAILED');
    return this.send(recipient, token, 'sampleFile', { mediaId: uploaded.media_id, fileName: file.fileName, fileType }, signal);
  }
}
