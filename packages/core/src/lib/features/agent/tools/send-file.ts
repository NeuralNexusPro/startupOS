import { Type } from '@sinclair/typebox';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { requireChannelFileReply } from '../../../integrations/pi-agent/channel-file-reply';
import type { ToolRegistration } from '../../../integrations/pi-agent/types';

const parameters = Type.Object({ filePath: Type.String({ minLength: 1 }) }, { additionalProperties: false });
export const MAX_REPLY_FILE_BYTES = 20_000_000;
export const sendFileTool: ToolRegistration<typeof parameters> = {
  name: 'send_file', label: '发送文件到当前 IM 会话',
  description: '将当前工作目录内的文件发回触发本次调用的 IM 会话。文件最大20_000_000字节，仅接受 filePath；确认投递后返回成功。',
  parameters, category: 'file', enabled: true,
  async execute(toolCallId, params, signal) {
    try {
      if (!params || typeof params.filePath !== 'string' || !params.filePath.trim()
        || Object.keys(params).some((key) => key !== 'filePath') || !toolCallId) throw new Error('IM_FILE_INPUT_INVALID');
      const reply = requireChannelFileReply();
      const abortSignal = signal ? AbortSignal.any([signal, reply.signal]) : reply.signal;
      abortSignal.throwIfAborted();
      const root = await fs.realpath(reply.workingDirectory);
      const target = await fs.realpath(path.resolve(root, params.filePath));
      const relative = path.relative(root, target);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('IM_FILE_OUTSIDE_WORKING_DIRECTORY');
      const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let bytes: Buffer;
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size === 0) throw new Error('IM_FILE_NOT_NONEMPTY_REGULAR_FILE');
        if (stat.size > MAX_REPLY_FILE_BYTES) throw new Error('IM_FILE_TOO_LARGE');
        const buffer = Buffer.alloc(MAX_REPLY_FILE_BYTES + 1);
        let length = 0;
        while (length < buffer.length) {
          abortSignal.throwIfAborted();
          const result = await handle.read(buffer, length, Math.min(64 * 1024, buffer.length - length), null);
          if (result.bytesRead === 0) break;
          length += result.bytesRead;
        }
        if (length === 0) throw new Error('IM_FILE_NOT_NONEMPTY_REGULAR_FILE');
        if (length > MAX_REPLY_FILE_BYTES) throw new Error('IM_FILE_TOO_LARGE');
        bytes = buffer.subarray(0, length);
      } finally { await handle.close(); }
      await reply.sendFile({ fileName: path.basename(target), bytes }, toolCallId, abortSignal);
      return { content: [{ type: 'text', text: `文件已发送：${path.basename(target)}` }], details: { fileName: path.basename(target), delivered: true } };
    } catch (error: unknown) {
      const code = error instanceof Error && /^IM_FILE_[A-Z_]+$/.test(error.message) ? error.message : 'IM_FILE_SEND_FAILED';
      const message = code === 'IM_FILE_FORMAT_UNSUPPORTED' ? '当前渠道不支持此格式，请生成ZIP后发送' : code === 'IM_FILE_TOO_LARGE' ? '文件超过20_000_000字节上限' : code;
      return { content: [{ type: 'text', text: message }], details: { error: true, code } };
    }
  },
};
