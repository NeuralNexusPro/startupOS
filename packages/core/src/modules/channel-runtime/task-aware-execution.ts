export interface TaskReplyRouteResult<TSnapshot> {
  handled: boolean;
  snapshot?: TSnapshot;
}

export interface TaskAwareChannelExecutionOptions<TSnapshot> {
  content: string;
  submitTaskReply(content: string): Promise<TaskReplyRouteResult<TSnapshot>>;
  promptChat(): Promise<void>;
}

export type TaskAwareChannelExecutionResult<TSnapshot> =
  | { handledBy: 'chat' }
  | { handledBy: 'task_runtime'; snapshot?: TSnapshot };

export async function routeTaskAwareChannelMessage<TSnapshot>(
  options: TaskAwareChannelExecutionOptions<TSnapshot>,
): Promise<TaskAwareChannelExecutionResult<TSnapshot>> {
  const taskReply = await options.submitTaskReply(options.content);
  if (taskReply.handled) {
    return {
      handledBy: 'task_runtime',
      ...(taskReply.snapshot === undefined ? {} : { snapshot: taskReply.snapshot }),
    };
  }
  await options.promptChat();
  return { handledBy: 'chat' };
}
