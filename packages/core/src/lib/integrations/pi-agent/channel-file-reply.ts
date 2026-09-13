import { AsyncLocalStorage } from 'node:async_hooks';

export interface ChannelReplyFile { fileName: string; bytes: Uint8Array }
export type ChannelFileSender = (file: ChannelReplyFile, toolCallId: string, signal?: AbortSignal) => Promise<void>;
interface ReplyContext { sender: ChannelFileSender; lease: AbortController; workingDirectory?: string }
const storage = new AsyncLocalStorage<ReplyContext>();

export async function withChannelFileReply<T>(sender: ChannelFileSender, operation: () => Promise<T>): Promise<T> {
  const lease = new AbortController();
  try { return await storage.run({ sender, lease }, operation); }
  finally { lease.abort(); }
}

export function withChannelFileWorkingDirectory<T>(workingDirectory: string | undefined, operation: () => Promise<T>): Promise<T> {
  const context = storage.getStore();
  return context ? storage.run({ ...context, workingDirectory }, operation) : operation();
}

export function requireChannelFileReply(): { workingDirectory: string; sendFile: ChannelFileSender; signal: AbortSignal } {
  const context = storage.getStore();
  if (!context || context.lease.signal.aborted) throw new Error('IM_FILE_REPLY_UNAVAILABLE');
  if (!context.workingDirectory) throw new Error('IM_FILE_WORKING_DIRECTORY_MISSING');
  return {
    workingDirectory: context.workingDirectory,
    signal: context.lease.signal,
    sendFile: async (file, toolCallId, signal) => {
      const combined = signal ? AbortSignal.any([context.lease.signal, signal]) : context.lease.signal;
      combined.throwIfAborted();
      await context.sender(file, toolCallId, combined);
      combined.throwIfAborted();
    },
  };
}
