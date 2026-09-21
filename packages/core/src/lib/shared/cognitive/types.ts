/**
 * shared/cognitive/types.ts — Layer 0 共享认知类型
 *
 * 仅类型与接口定义，无运行时实现，无 React 依赖。
 * 可被 lib/integrations/、lib/features/、src/modules/、src/components/、src/app/ 共享。
 */

export interface CorrectionSignal {
  strength: 'strong' | 'medium' | 'weak';
  matched: string;
  excerpt: string;
}

export interface CommunicationSource {
  origin?: string;
  connectorId?: string;
  conversationKind?: 'direct' | 'group' | 'thread';
  conversationId?: string;
  actorId?: string;
  actorDisplayName?: string;
  sessionId: string;
  messageId?: string;
  observedAt?: string;
}

export interface TurnCognitiveData {
  turnNumber: number;
  userMessage: string;
  assistantMessage: string;
  assistantThinking: string;
  toolCalls: Array<{
    name: string;
    params: unknown;
    result: string;
    success: boolean;
  }>;
  outcome: {
    resolved: boolean;
    toolChainLength: number;
    userCorrections?: number;
    correctionSignals?: CorrectionSignal[];
  };
  timestamp: number;
  source?: CommunicationSource;
}

export interface CognitiveProvider {
  readonly name: string;
  prefetch(query: string): Promise<string | null>;
  sync_turn(data: TurnCognitiveData): Promise<void>;
  system_prompt_block(): Promise<string>;
}

export interface MemoryBlock {
  label: string;
  value: string;
  limit: number;
  description: string;
  metadata: Record<string, unknown>;
  readOnly: boolean;
}
