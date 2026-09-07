import { reconcileFinalStreamContent } from '../../../../core/src/lib/integrations/pi-agent/stream-dedupe';

export interface AssistantStreamState {
  content: string;
  sent: boolean;
}

export interface AssistantMessageEnd {
  content: string;
  completionFailure?: boolean;
}

export interface AssistantMessageTransition extends AssistantStreamState {
  shouldSend: boolean;
}

export function applyAssistantMessageEnd(
  state: AssistantStreamState,
  message: AssistantMessageEnd
): AssistantMessageTransition {
  if (!message.content) {
    return { ...state, shouldSend: false };
  }
  if (message.completionFailure) {
    return { ...state, shouldSend: false };
  }
  const content = reconcileFinalStreamContent(state.content, message.content);
  const shouldSend = !state.sent;
  return {
    content,
    sent: state.sent || shouldSend,
    shouldSend,
  };
}
