/**
 * OS.7: Message Bridge
 */

import { AgentMessage } from '@/types/agent-host';
import { AgentHostIntegration } from './integration';

export class MessageBridge {
  constructor(private readonly integration: AgentHostIntegration) {}

  private subscriptions = new Map<string, () => void>();

  bridge(agentId: string, onMessage: (message: AgentMessage) => void): () => void {
    const integration = this.integration;

    const unsubscribe = integration.subscribeToMessages(agentId, {
      onChunk: (chunk) => {
        onMessage({
          role: 'assistant',
          content: chunk,
          timestamp: Date.now(),
        });
      },
      onComplete: () => {
        console.log('Message complete');
      },
      onError: (error) => {
        console.error('Message error:', error);
      },
    });

    this.subscriptions.set(agentId, unsubscribe);
    return unsubscribe;
  }

  cleanup(agentId: string): void {
    const unsubscribe = this.subscriptions.get(agentId);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(agentId);
    }
  }
}
