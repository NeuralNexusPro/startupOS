/**
 * Memory Consolidator — 窗体关闭时的主动记忆整理。
 *
 * Phase 1: LLM 分析近期对话 → 输出 block 级更新指令
 * Phase 2: 解析指令，通过 Memory CRUD 更新 block → save()
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { Memory } from './memory';
import { HistoryStore, type RecallEntry } from '../recall/history-store';
import { ArchivalMemory } from '../archival/archival-memory';
import { ingestReflectionToArchival } from '../archival/pattern-ingest';
import type { CognitionBank, CognitionKind, EvidenceRef } from '../bank';
import type { Model } from '@originos/pi-agent-adapter/ai';

type ConsolidationModel = Model<'anthropic-messages' | 'openai-completions' | 'google' | 'azure-openai-responses'>;
const MIN_REFLECT_TURNS = 5;

export interface MemoryConsolidatorDeps {
  createAutoModel(): ConsolidationModel;
}

export interface ConsolidationResult {
  consolidated: boolean;
  changes: string[];
  reason?: string;
  stableMemory: string[];
  patterns: string[];
  knowledgeCandidates: Array<{
    entities: Array<{ name: string; type: string; attributes: Record<string, unknown> }>;
    facts: string[];
  }>;
}

interface ConsolidationInstruction {
  action: 'ADD' | 'UPDATE';
  label: string;
  content: string;
}

export interface CognitionRouting {
  userBank: CognitionBank | null;
  ownerBank: CognitionBank | null;
}

export class MemoryConsolidator {
  private memory: Memory;
  private history: HistoryStore;
  private archival: ArchivalMemory;
  constructor(
    agentDir: string,
    private readonly sessionId: string = 'default',
    private readonly deps?: MemoryConsolidatorDeps,
    private readonly cognition?: CognitionRouting,
  ) {
    this.memory = new Memory(agentDir);
    this.history = new HistoryStore(path.join(agentDir, 'memory', 'history'), sessionId);
    this.archival = new ArchivalMemory(agentDir);
  }

  async consolidate(): Promise<ConsolidationResult> {
    const entries = this.history.readAll();
    const recentTurns = entries.slice(-50);
    const stableMemoryTurns = this.extractStableMemoryTurns(recentTurns);

    if (recentTurns.length < MIN_REFLECT_TURNS) {
      return {
        consolidated: false,
        changes: [],
        reason: 'too few turns',
        stableMemory: stableMemoryTurns,
        patterns: [],
        knowledgeCandidates: [],
      };
    }

    const instructions = await this.analyzeRecentHistory(recentTurns);
    const reflectionTurns = recentTurns.filter((turn) => this.shouldCreateReflection(turn));
    const knowledgeCandidates = this.extractKnowledgeCandidates(recentTurns);
    const reflectionChanges = await this.ingestReflections(reflectionTurns);
    const changes = this.applyInstructions(instructions);
    changes.push(...this.retainOwnerEvidence(recentTurns, knowledgeCandidates));
    if (changes.length === 0 && reflectionChanges.length === 0) {
      return {
        consolidated: false,
        changes: [],
        reason: 'no instructions',
        stableMemory: stableMemoryTurns,
        patterns: reflectionChanges,
        knowledgeCandidates,
      };
    }

    this.memory.save();

    return {
      consolidated: true,
      changes: [...changes, ...reflectionChanges],
      stableMemory: stableMemoryTurns,
      patterns: reflectionChanges,
      knowledgeCandidates,
    };
  }

  private async analyzeRecentHistory(turns: RecallEntry[]): Promise<ConsolidationInstruction[]> {
    const existingMemory = this.memory.compile({ format: 'xml' });
    const conversation = turns
      .map(
        (e) =>
          `Turn #${e.turnNumber}:\nUser: ${e.userMessage}\nAssistant: ${e.assistantMessage ?? ''}`,
      )
      .join('\n\n');

    const prompt = `Analyze the following conversation and output block-level update instructions for the Memory blocks.

Current Memory Blocks:
${existingMemory}

Conversation History (last ${turns.length} turns):
${conversation}

Output format (one per line, specify block label):
- [UPDATE:human] new user fact
- [UPDATE:persona] agent self-awareness adjustment
- [UPDATE:project] project state/decision
- [UPDATE:scratchpad] temporary note
- [ADD:scratchpad] new temporary content
- [SKIP] if no update needed

Rules:
- Only record concrete, non-derivable facts
- Deduplicate: do not repeat what's already in blocks
- Keep entries atomic and specific
- [SKIP] if all important info is already covered

Respond in the same language as the conversation (Chinese if conversation is in Chinese).`;

    try {
      if (!this.deps) return [];
      const model = this.deps.createAutoModel();
      const { complete } = await import('@originos/pi-agent-adapter/ai');
      const result = await complete(model, {
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
      });
      const text = extractText(result.content);
      console.log(`[Consolidator] LLM output (${text.length} chars): ${text.slice(0, 200)}...`);
      return this.parseInstructions(text);
    } catch (err) {
      console.error('[Consolidator] LLM analysis failed:', err);
      return [];
    }
  }

  private parseInstructions(text: string): ConsolidationInstruction[] {
    const instructions: ConsolidationInstruction[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '[SKIP]') continue;

      const match = trimmed.match(/^[-*]?\s*\[(ADD|UPDATE):([a-z]+)\]\s+(.+)$/);
      if (!match) continue;

      const action = match[1] as 'ADD' | 'UPDATE';
      const label = match[2]!;
      const content = match[3]!;

      // temporal is readOnly, skip
      if (label === 'temporal') continue;

      instructions.push({ action, label, content });
    }

    return instructions;
  }

  private applyInstructions(instructions: ConsolidationInstruction[]): string[] {
    const changes: string[] = [];

    for (const inst of instructions) {
      const routed = this.routeInstruction(inst);
      if (routed) {
        changes.push(routed);
        continue;
      }
      const block = this.memory.getBlock(inst.label);
      if (!block) {
        console.warn(`[Consolidator] Block '${inst.label}' not found, skipping`);
        continue;
      }

      try {
        this.memory.appendBlock(inst.label, inst.content);
        changes.push(`[${inst.action}:${inst.label}] ${inst.content.slice(0, 80)}...`);
      } catch (err) {
        console.warn(`[Consolidator] Failed to ${inst.action} block '${inst.label}':`, err);
      }
    }

    return changes;
  }

  private routeInstruction(instruction: ConsolidationInstruction): string | null {
    const bank = instruction.label === 'human'
      ? this.cognition?.userBank
      : instruction.label === 'project'
        ? this.cognition?.ownerBank
        : null;
    if (!bank) return null;
    const kind: CognitionKind = instruction.label === 'human' ? 'observation' : 'world_fact';
    bank.retain({
      kind,
      content: instruction.content,
      evidence: this.evidence(
        `instruction:${instruction.label}:${instruction.content}`,
        'conversation',
        instruction.content,
      ),
      tags: [instruction.label === 'human' ? 'user-profile' : 'project-memory'],
    });
    return `[COGNITION:${instruction.label}] ${instruction.content.slice(0, 80)}...`;
  }

  private retainOwnerEvidence(
    turns: RecallEntry[],
    candidates: ConsolidationResult['knowledgeCandidates'],
  ): string[] {
    const bank = this.cognition?.ownerBank;
    if (!bank) return [];
    const changes: string[] = [];
    for (const [candidateIndex, candidate] of candidates.entries()) {
      for (const fact of candidate.facts) {
        bank.retain({
          kind: 'world_fact',
          content: fact,
          evidence: this.evidence(`fact:${candidateIndex}:${fact}`, 'conversation', fact),
          tags: ['knowledge-candidate'],
        });
        changes.push(`[COGNITION:world_fact] ${fact.slice(0, 80)}...`);
      }
    }
    for (const turn of turns) {
      for (const [toolIndex, toolCall] of (turn.toolCalls ?? []).entries()) {
        bank.retain({
          kind: 'experience',
          content: `${toolCall.name}: ${toolCall.success ? 'success' : 'failure'} — ${toolCall.result.slice(0, 500)}`,
          evidence: this.evidence(
            `turn:${turn.turnNumber}:tool:${toolIndex}:${toolCall.name}`,
            'tool',
            toolCall.result.slice(0, 4096),
          ),
          tags: [toolCall.success ? 'tool-success' : 'tool-failure', toolCall.name],
        });
        changes.push(`[COGNITION:experience] ${toolCall.name} turn=${turn.turnNumber}`);
      }
    }
    return changes;
  }

  private evidence(key: string, source: EvidenceRef['source'], excerpt: string): EvidenceRef {
    return {
      id: createHash('sha256').update(`${this.sessionId}\0${key}`).digest('hex'),
      source,
      sourceId: this.sessionId,
      excerpt,
      observedAt: new Date().toISOString(),
    };
  }

  private extractStableMemoryTurns(turns: RecallEntry[]): string[] {
    return turns
      .map((turn) => turn.userMessage.trim())
      .filter((message) => this.looksLikeStableMemory(message))
      .slice(-10);
  }

  private looksLikeStableMemory(message: string): boolean {
    if (!message) return false;
    const stableSignals = [
      '我喜欢',
      '我习惯',
      '请一直',
      '默认用',
      '偏好',
      '长期',
      '以后都',
      '不要再',
      '务必',
    ];
    return stableSignals.some((signal) => message.includes(signal));
  }

  private shouldCreateReflection(turn: RecallEntry): boolean {
    if (!turn.toolCalls || turn.toolCalls.length === 0) {
      return false;
    }
    return turn.toolCalls.some((toolCall) => !toolCall.success);
  }

  private async ingestReflections(turns: RecallEntry[]): Promise<string[]> {
    const changes: string[] = [];

    for (const turn of turns) {
      const failedCalls = (turn.toolCalls ?? []).filter((toolCall) => !toolCall.success);
      if (failedCalls.length === 0) {
        continue;
      }

      await ingestReflectionToArchival(this.archival, {
        scene: turn.userMessage,
        toolChain: (turn.toolCalls ?? []).map((toolCall) => toolCall.name),
        failureReason: failedCalls.map((toolCall) => `${toolCall.name}: ${toolCall.result}`).join('; '),
        lesson: '该工具链在当前场景下未稳定收敛，不应直接重复。',
        tryNextTime: '保留最近失败原因，优先尝试替代路径或请求补充信息。',
      });
      changes.push(`[REFLECTION] ${turn.userMessage.slice(0, 80)}${turn.userMessage.length > 80 ? '...' : ''}`);
    }

    return changes;
  }

  private extractKnowledgeCandidates(turns: RecallEntry[]): Array<{
    entities: Array<{ name: string; type: string; attributes: Record<string, unknown> }>;
    facts: string[];
  }> {
    return turns
      .map((turn) => {
        const entities: Array<{ name: string; type: string; attributes: Record<string, unknown> }> = [];
        const facts: string[] = [];

        const entityRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
        let match: RegExpExecArray | null;
        while ((match = entityRegex.exec(turn.userMessage)) !== null) {
          if (match[1] && !entities.some((entity) => entity.name === match![1]) && match[1].length > 2) {
            entities.push({
              name: match[1],
              type: 'Concept',
              attributes: { source: 'consolidator', turn: turn.turnNumber },
            });
          }
        }

        if (turn.assistantMessage && turn.assistantMessage.length > 20 && turn.assistantMessage.length < 500) {
          facts.push(`Turn #${turn.turnNumber}: ${turn.assistantMessage.slice(0, 200)}`);
        }

        for (const toolCall of turn.toolCalls ?? []) {
          if (toolCall.success && toolCall.result.length > 30 && toolCall.result.length < 500) {
            facts.push(`Turn #${turn.turnNumber}: ${toolCall.name} → ${toolCall.result.slice(0, 200)}`);
          }
        }

        return { entities, facts };
      })
      .filter((candidate) => candidate.entities.length > 0 || candidate.facts.length > 0);
  }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const block = item as { type?: unknown; text?: unknown };
      return block.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
    }).join(' ');
  }
  return '';
}
