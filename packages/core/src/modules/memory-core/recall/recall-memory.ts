/**
 * Recall Memory — 对话历史索引 + 语义搜索。
 *
 * Story M.4: 升级现有关键词搜索为语义搜索，保留 keyword 回退。
 */

import path from 'node:path';
import { HistoryStore, type RecallEntry } from './history-store';
import { cosineSimilarity, embeddingEngine } from '../archival/embedding';

export interface RecallSearchResult {
  turnNumber: number;
  score: number;
  summary: string;
  text: string;
}

export class RecallMemory {
  private entries: RecallEntry[] = [];
  private historyStore: HistoryStore;

  constructor(agentDir: string, sessionId: string = 'default') {
    this.historyStore = new HistoryStore(
      path.join(agentDir, 'memory', 'history'),
      sessionId
    );
    this.loadFromDisk();
  }

  /** 记录一轮对话 */
  recordTurn(data: {
    turnNumber: number;
    userMessage: string;
    assistantMessage?: string;
    toolCalls?: Array<{ name: string; params?: unknown; result: string; success: boolean }>;
  }): void {
    const entry: RecallEntry = {
      turnNumber: data.turnNumber,
      summary: data.userMessage.slice(0, 200),
      userMessage: data.userMessage,
      assistantMessage: data.assistantMessage ?? '',
      toolCalls: data.toolCalls ?? [],
      timestamp: Date.now(),
    };
    this.entries.push(entry);
    this.historyStore.append(entry);
  }

  /** 语义搜索对话历史（ONNX 可用时用余弦相似度，否则用 TF-IDF 向量余弦） */
  async searchSemantic(query: string, maxResults = 5): Promise<RecallSearchResult[]> {
    const queryEmbedding = await embeddingEngine.encode(query);

    const scored = await Promise.all(
      this.entries.map(async (entry) => {
        const textContent = `${entry.userMessage} ${entry.assistantMessage ?? ''}`;
        const entryEmbedding = await embeddingEngine.encode(textContent);
        const score = cosineSimilarity(queryEmbedding, entryEmbedding);
        return {
          turnNumber: entry.turnNumber,
          score,
          summary: entry.summary,
          text: entry.userMessage,
        };
      })
    );

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  /** 关键词搜索（回退模式） */
  searchKeyword(query: string, maxResults = 5): RecallSearchResult[] {
    const scored = this.entries.map((entry) => this.scoreKeyword(entry, query));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  count(): number {
    return this.entries.length;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private loadFromDisk(): void {
    this.entries = this.historyStore.readAll();
  }

  private scoreKeyword(entry: RecallEntry, query: string): RecallSearchResult {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const text = `${entry.userMessage} ${entry.assistantMessage ?? ''}`.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) score += 1;
    }
    return {
      turnNumber: entry.turnNumber,
      score: score / Math.max(queryTerms.length, 1),
      summary: entry.summary,
      text: entry.userMessage,
    };
  }
}
