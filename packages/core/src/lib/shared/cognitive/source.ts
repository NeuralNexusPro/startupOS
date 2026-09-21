import type { CommunicationSource } from './types';

export function communicationSourceContext(source: CommunicationSource): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0));
}

export function formatCommunicationSource(source?: CommunicationSource): string {
  return source ? JSON.stringify(communicationSourceContext(source)) : '{}';
}

export function encodeCommunicationUserMessage(
  text: string,
  source: CommunicationSource,
  attachmentRefs: readonly string[] = [],
): string {
  return JSON.stringify({
    text,
    ...(source.actorId ? { sender: { id: source.actorId, ...(source.actorDisplayName ? { displayName: source.actorDisplayName } : {}) } } : {}),
    ...(source.conversationId ? { conversation: { id: source.conversationId, ...(source.conversationKind ? { kind: source.conversationKind } : {}) } } : {}),
    ...(source.origin ? { origin: source.origin } : {}),
    source: communicationSourceContext(source),
    ...(attachmentRefs.length ? { attachmentRefs: [...attachmentRefs] } : {}),
  });
}
