/**
 * Archival Memory — 长期语义记忆存储。
 *
 * Story M.3: ONNX embedding + HNSW 向量索引 + 持久化。
 *
 * 流程: insert → 内容编码 → HNSW 插入 → 持久化
 *       search → 查询编码 → HNSW 搜索 → RRF 融合 → MMR 去重 → 返回
 */

import fs from 'node:fs';
import path from 'node:path';
import { cosineSimilarity, embeddingEngine } from './embedding';
import { HNSWIndex } from './hnsw-index';

// ============================================================================
// Types
// ============================================================================

export interface ArchivalEntry {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  embedding?: Int8Array; // Int8 quantized
}

export interface ArchivalSearchResult {
  id: string;
  text: string;
  score: number;
  tags: string[];
  createdAt: number;
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  tags?: string[];
  diversity?: number;
}

// ============================================================================
// ArchivalMemory
// ============================================================================

export class ArchivalMemory {
  private entries: ArchivalEntry[] = [];
  private hnswIndex: HNSWIndex;
  private storePath: string;
  private entriesFile: string;
  private indexFile: string;
  private indexReady = false;
  private indexBuildPromise: Promise<void> | null = null;

  constructor(agentDir: string) {
    this.storePath = path.join(agentDir, 'archival');
    this.entriesFile = path.join(this.storePath, 'entries.jsonl');
    this.indexFile = path.join(this.storePath, 'hnsw-index.bin');
    this.hnswIndex = new HNSWIndex({ m: 16, efConstruction: 200 });
    this.ensureStoreDir();
    this.loadFromDisk();
  }

  /** 写入一条新记忆 */
  async insert(text: string, tags?: string[]): Promise<string> {
    const id = `arch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const embedding = await embeddingEngine.encode(text);
    const quantized = new Int8Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      const v = embedding[i] ?? 0;
      quantized[i] = v > 0 ? Math.min(127, Math.round(v * 127)) : Math.max(-128, Math.round(v * 127));
    }

    const entry: ArchivalEntry = {
      id,
      text,
      tags: tags ?? [],
      createdAt: Date.now(),
      embedding: quantized,
    };

    this.entries.push(entry);
    this.hnswIndex.insert(id, embedding);
    await this.persist();

    return id;
  }

  /** 语义搜索 */
  async search(query: string, options?: SearchOptions): Promise<ArchivalSearchResult[]> {
    await this.ensureIndexReady();

    const { limit = 10, minScore = 0.1, tags, diversity = 0.7 } = options ?? {};

    const queryEmbedding = await embeddingEngine.encode(query);
    const candidates = this.hnswIndex.search(queryEmbedding, limit * 3);

    // 按标签过滤
    let filtered = candidates;
    if (tags && tags.length > 0) {
      filtered = candidates.filter((c) => {
        const entry = this.getEntryById(c.id);
        return entry && entry.tags.some((t) => tags.includes(t));
      });
    }

    // 余弦相似度 RRF 融合
    const scored = filtered.map((c) => {
      const entry = this.getEntryById(c.id)!;
      const entryEmbedding = this.dequantize(entry.embedding!);
      const relevance = cosineSimilarity(queryEmbedding, entryEmbedding);

      // 时间衰减
      const ageDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
      const temporalScore = 1 / (1 + 0.1 * ageDays);

      // RRF 融合
      const rank = filtered.indexOf(c) + 1;
      const rrfScore = 1 / (60 + rank);

      const finalScore =
        relevance * 0.6 + temporalScore * 0.2 + rrfScore * 10 * 0.2;

      return {
        id: entry.id,
        text: entry.text,
        score: finalScore,
        tags: entry.tags,
        createdAt: entry.createdAt,
      };
    });

    // MMR 去重
    const diverse = this.applyMMR(scored, diversity);

    return diverse
      .filter((r) => r.score >= minScore)
      .slice(0, limit);
  }

  /** 删除条目 */
  delete(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.hnswIndex.delete(id);
    this.persist();
    return true;
  }

  getAll(limit?: number): ArchivalEntry[] {
    const entries = this.entries.map(({ id, text, tags, createdAt }) => ({
      id, text, tags, createdAt,
    }));
    return limit ? entries.slice(0, limit) : entries;
  }

  count(): number {
    return this.entries.length;
  }

  /** 持久化到磁盘 */
  async persist(): Promise<void> {
    // entries.jsonl
    const lines = this.entries.map((e) => {
      const timestamp = new Date(e.createdAt).toISOString();
      return JSON.stringify({
        version: 'memory-core/1.0',
        createdAt: timestamp,
        updatedAt: timestamp,
        data: { id: e.id, text: e.text, tags: e.tags, createdAt: e.createdAt },
      });
    }).join('\n');
    fs.writeFileSync(this.entriesFile, lines + '\n', 'utf-8');

    // hnsw-index.bin (JSON serialized for now)
    const indexData = JSON.stringify(this.hnswIndex.toJSON());
    fs.writeFileSync(this.indexFile, indexData, 'utf-8');
  }

  /** 从磁盘加载 */
  private loadFromDisk(): void {
    if (!fs.existsSync(this.entriesFile)) return;

    try {
      const content = fs.readFileSync(this.entriesFile, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const data = parsed['data'] && typeof parsed['data'] === 'object'
            ? parsed['data'] as Record<string, unknown>
            : parsed;
          if (typeof data['id'] !== 'string' || typeof data['text'] !== 'string') continue;
          this.entries.push({
            id: data['id'],
            text: data['text'],
            tags: Array.isArray(data['tags']) ? data['tags'].filter((tag): tag is string => typeof tag === 'string') : [],
            createdAt: typeof data['createdAt'] === 'number' ? data['createdAt'] : Date.now(),
            embedding: undefined, // embeddings 需重新编码
          });
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file doesn't exist or is corrupt
    }

    // Do not rebuild embeddings during Agent startup. Rebuild lazily on the
    // first semantic search so opening a window does not fan out CPU-heavy
    // embedding jobs for every persisted archival entry.
  }

  private async ensureIndexReady(): Promise<void> {
    if (this.indexReady) return;
    if (this.indexBuildPromise) {
      await this.indexBuildPromise;
      return;
    }

    this.indexBuildPromise = this.rebuildIndex();
    try {
      await this.indexBuildPromise;
      this.indexReady = true;
    } finally {
      this.indexBuildPromise = null;
    }
  }

  private async rebuildIndex(): Promise<void> {
    this.hnswIndex = new HNSWIndex({ m: 16, efConstruction: 200 });
    let changed = false;

    for (const entry of this.entries) {
      if (entry.embedding) {
        const embedding = this.dequantize(entry.embedding);
        this.hnswIndex.insert(entry.id, embedding);
        continue;
      }

      const emb = await embeddingEngine.encode(entry.text);
      const quantized = new Int8Array(emb.length);
      for (let i = 0; i < emb.length; i++) {
        const v = emb[i] ?? 0;
        quantized[i] = v > 0 ? Math.min(127, Math.round(v * 127)) : Math.max(-128, Math.round(v * 127));
      }
      entry.embedding = quantized;
      this.hnswIndex.insert(entry.id, emb);
      changed = true;
    }

    if (changed) {
      await this.persist();
    }
  }

  private dequantize(vector: Int8Array): Float32Array {
    const result = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      result[i] = (vector[i] ?? 0) / 127;
    }
    return result;
  }

  private getEntryById(id: string): ArchivalEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  private ensureStoreDir(): void {
    if (!fs.existsSync(this.storePath)) {
      fs.mkdirSync(this.storePath, { recursive: true });
    }
  }

  /** MMR (Maximal Marginal Relevance) 去重 */
  private applyMMR(
    results: ArchivalSearchResult[],
    lambda: number,
  ): ArchivalSearchResult[] {
    if (results.length <= 1) return results;

    const selected: number[] = [];
    const remaining = results.map((_, i) => i);

    while (remaining.length > 0) {
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (const i of remaining) {
        const relevance = results[i]?.score ?? 0;
        let maxSimilarity = 0;
        for (const j of selected) {
          const sim = cosineSimilarity(
            this.getEntryById(results[i]?.id ?? '')?.embedding ?? new Int8Array(384),
            this.getEntryById(results[j]?.id ?? '')?.embedding ?? new Int8Array(384),
          );
          if (sim > maxSimilarity) maxSimilarity = sim;
        }
        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break;
      selected.push(bestIdx);
      remaining.splice(remaining.indexOf(bestIdx), 1);
    }

    return selected.map((i) => results[i]).filter((r): r is ArchivalSearchResult => r !== undefined);
  }
}
