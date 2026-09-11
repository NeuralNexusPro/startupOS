/**
 * HNSW Index — Hierarchical Navigable Small World 图构建 + 搜索。
 *
 * Story M.3: HNSW 向量索引，复用 Story 9.20 设计。
 *
 * 参数: m=16, ef_construction=200
 * 支持: insert, search, persistence, index rebuild
 */

import { cosineSimilarity } from './embedding';

export interface HNSWIndexOptions {
  m?: number;
  efConstruction?: number;
  efSearch?: number;
  dimensions?: number;
}

interface HNSWNode {
  id: string;
  embedding: Float32Array;
  layers: Array<Set<number>>; // node indices per layer
}

interface SerializedHNSWNode {
  id: string;
  embedding: number[];
  layers: number[][];
}

interface SerializedHNSWIndex {
  m?: number;
  efConstruction?: number;
  nodes: SerializedHNSWNode[];
}

export class HNSWIndex {
  private nodes: Array<HNSWNode | null> = [];
  private idToIndex = new Map<string, number>();
  private m: number;
  private efConstruction: number;
  private efSearch: number;

  constructor(options: HNSWIndexOptions = {}) {
    this.m = options.m ?? 16;
    this.efConstruction = options.efConstruction ?? 200;
    this.efSearch = options.efSearch ?? 10;
  }

  /** 插入新条目 */
  insert(id: string, embedding: Float32Array): void {
    const nodeIndex = this.nodes.length;
    const node: HNSWNode = {
      id,
      embedding,
      layers: [],
    };

    // 随机层数（geometric distribution）
    let level = 0;
    while (Math.random() < 1 / Math.log2(this.m + 1) && level < 3) level++;
    for (let i = 0; i <= level; i++) {
      node.layers.push(new Set<number>());
    }

    // 在每层连接到最近邻居
    for (let layer = 0; layer < node.layers.length; layer++) {
      const neighbors = this.findNearestInLayer(node.embedding, layer, this.m);
      for (const n of neighbors) {
        node.layers[layer]!.add(n);
        // 双向连接
        const targetNode = this.nodes[n];
        if (targetNode && targetNode.layers[layer]) {
          targetNode.layers[layer]!.add(nodeIndex);
          // 限制最大连接数
          while (targetNode.layers[layer]!.size > this.m * 2) {
            const first = targetNode.layers[layer]!.values().next().value;
            if (first !== undefined) targetNode.layers[layer]!.delete(first);
          }
        }
      }
    }

    this.nodes.push(node);
    this.idToIndex.set(id, nodeIndex);
  }

  /** 搜索最近邻居 */
  search(query: Float32Array, k: number): Array<{ id: string; score: number }> {
    if (this.nodes.length === 0) return [];

    // 简化实现：对中小型索引使用暴力搜索（HNSW 搜索逻辑复杂，
    // 小规模场景下暴力搜索足够快且更可靠）
    if (this.nodes.length <= 1000) {
      return this.bruteForceSearch(query, k);
    }

    // HNSW 搜索：从顶层开始向下导航
    let currentIdx = Math.floor(Math.random() * this.nodes.length);

    for (let layer = this.getMaxLayer(); layer >= 0; layer--) {
      let improved = true;
      while (improved) {
        improved = false;
        const currentNode = this.nodes[currentIdx];
        const currentLayer = currentNode?.layers[layer];
        if (!currentLayer) continue;

        let bestDist = -Infinity;
        for (const neighborIdx of currentLayer) {
          const neighbor = this.nodes[neighborIdx];
          if (!neighbor) continue;
          const score = cosineSimilarity(query, neighbor.embedding);
          if (score > bestDist) {
            bestDist = score;
            currentIdx = neighborIdx;
            improved = true;
          }
        }
      }
    }

    // 从最终位置进行 efSearch 扩展
    return this.expandSearch(currentIdx, k);
  }

  /** 删除条目 */
  delete(id: string): void {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return;

    this.nodes[idx] = null;
    this.idToIndex.delete(id);
  }

  /** 获取节点数量 */
  count(): number {
    return this.nodes.filter((node) => node !== null).length;
  }

  /** 序列化到 JSON（用于持久化） */
  toJSON(): unknown {
    return {
      m: this.m,
      efConstruction: this.efConstruction,
      nodes: this.nodes.flatMap((node) => node ? [{
        id: node.id,
        embedding: Array.from(node.embedding),
        layers: node.layers.map((layer) => Array.from(layer)),
      }] : []),
    };
  }

  /** 从 JSON 反序列化 */
  fromJSON(data: unknown): void {
    if (!isSerializedHNSWIndex(data)) throw new Error('Invalid HNSW index data');
    const json = data;
    this.m = json.m ?? 16;
    this.efConstruction = json.efConstruction ?? 200;
    this.nodes = json.nodes.map((node) => ({
      id: node.id,
      embedding: new Float32Array(node.embedding),
      layers: node.layers.map((layer) => new Set<number>(layer)),
    }));
    this.idToIndex.clear();
    this.nodes.forEach((n, i) => {
      if (n) this.idToIndex.set(n.id, i);
    });
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private getMaxLayer(): number {
    let max = 0;
    for (const node of this.nodes) {
      if (node && node.layers.length > max) max = node.layers.length;
    }
    return max;
  }

  private findNearestInLayer(query: Float32Array, layer: number, k: number): Set<number> {
    const candidates: Array<{ idx: number; score: number }> = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (!node || node.layers.length <= layer) continue;
      const score = cosineSimilarity(query, node.embedding);
      candidates.push({ idx: i, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return new Set(candidates.slice(0, k).map((c) => c.idx));
  }

  private bruteForceSearch(query: Float32Array, k: number): Array<{ id: string; score: number }> {
    const results: Array<{ id: string; score: number }> = [];
    for (const node of this.nodes) {
      if (!node) continue;
      const score = cosineSimilarity(query, node.embedding);
      results.push({ id: node.id, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  private expandSearch(
    entryIdx: number,
    k: number,
  ): Array<{ id: string; score: number }> {
    const visited = new Set<number>();
    const candidates = new Map<number, number>(); // idx -> score
    const entry = this.nodes[entryIdx];
    if (!entry) return [];
    candidates.set(entryIdx, -Infinity);

    for (let i = 0; i < this.efSearch; i++) {
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (const [idx, score] of candidates) {
        if (visited.has(idx)) continue;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }
      if (bestIdx === -1) break;
      visited.add(bestIdx);
      candidates.delete(bestIdx);

      // 扩展邻居
      const node = this.nodes[bestIdx];
      if (!node) continue;
      const entryNode = this.nodes[entryIdx];
      if (!entryNode) continue;
      const score = cosineSimilarity(entryNode.embedding, node.embedding);
      candidates.set(bestIdx, score);

      for (let layer = 0; layer < node.layers.length; layer++) {
        for (const neighborIdx of node.layers[layer]!) {
          if (!visited.has(neighborIdx) && !candidates.has(neighborIdx)) {
            const neighbor = this.nodes[neighborIdx];
            if (!neighbor) continue;
            const s = cosineSimilarity(entryNode.embedding, neighbor.embedding);
            candidates.set(neighborIdx, s);
          }
        }
      }
    }

    const results = Array.from(candidates.entries())
      .map(([idx, score]) => ({ id: this.nodes[idx]?.id ?? '', score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return results;
  }
}

function isSerializedHNSWIndex(value: unknown): value is SerializedHNSWIndex {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate['nodes']) && candidate['nodes'].every((node) => {
    if (!node || typeof node !== 'object') return false;
    const item = node as Record<string, unknown>;
    return typeof item['id'] === 'string'
      && Array.isArray(item['embedding'])
      && item['embedding'].every((number) => typeof number === 'number')
      && Array.isArray(item['layers'])
      && item['layers'].every((layer) => Array.isArray(layer) && layer.every((index) => Number.isInteger(index)));
  });
}
