/**
 * OS.7: Agent Host Integration
 */

import type { PiAgentStore } from '../../../lib/integrations/pi-agent/store';
import type { AgentEvent } from '@originos/pi-agent-adapter';

export class AgentHostIntegration {
  constructor(private readonly piAgentStore: PiAgentStore) {}

  async initAgent(config: {
    agentId: string;
    projectContext: any;
    llmConfig?: {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      maxTokens?: number;
    };
  }): Promise<void> {
    await this.piAgentStore.initialize(config.agentId, config.projectContext, {}, config.llmConfig);
  }

  async sendMessage(agentId: string, message: string): Promise<void> {
    await this.piAgentStore.sendMessage(message);
  }

  subscribeToMessages(
    agentId: string,
    callbacks: {
      onChunk: (chunk: string) => void;
      onComplete: () => void;
      onError: (error: Error) => void;
    }
  ): () => void {
    return this.piAgentStore.subscribe((state) => {
      if (state.type === "message_update" || state.type === "message_end") {
        const msg = "message" in state ? state.message : null;
        if (msg) {
          const content = (msg as { content?: string | Array<{ type: string; text?: string }> }).content;
          if (typeof content === 'string') {
            callbacks.onChunk(content);
          } else if (Array.isArray(content)) {
            const textParts = content
              .filter((c) => c.type === 'text' && c.text)
              .map((c) => c.text ?? '')
              .join('');
            if (textParts) {
              callbacks.onChunk(textParts);
            }
          }
        }
      }
    });
  }

  async stopAgent(agentId: string): Promise<void> {
    this.piAgentStore.abort();
  }

  destroy(): void {
    this.piAgentStore.destroy();
  }
}
