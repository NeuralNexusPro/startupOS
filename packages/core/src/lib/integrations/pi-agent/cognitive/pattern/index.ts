/**
 * PatternProvider — 新版（cognitive/pattern/）
 *
 * 职责分层：
 *   - 上层：信号提取（CorrectionDetector + extractor）、Patterns.md 渲染
 *   - 底层：ArchivalMemory 存储 + 语义检索（由 Memory Core 提供）
 *
 * 替代旧版 cognitive/pattern-provider.ts 和
 * modules/memory-core/session/enhanced-pattern-provider.ts。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import type { CognitiveProvider, TurnCognitiveData } from '../types';
import type { ArchivalMemory } from '../../../../../modules/memory-core/archival/archival-memory';
import { detectCorrections } from './correction-detector';
import { extractAndIngest } from './extractor';
import { PatternRenderer } from './renderer';
import { migratePatternsToArchival } from '../../../../../modules/memory-core/archival/pattern-ingest';
import { ingestReflectionToArchival } from '../../../../../modules/memory-core/archival/pattern-ingest';
import type { CognitionDataFile, PatternEvidenceCandidate } from '../../../../../modules/memory-core/bank';

interface PatternEvidenceIndexEntry {
  archivalId: string;
  proofCount: number;
  evidenceIds: string[];
  updatedAt: string;
}

type PatternEvidenceIndex = Record<string, PatternEvidenceIndexEntry>;

export class PatternProvider implements CognitiveProvider {
  readonly name = 'pattern';

  private readonly agentDir: string;
  private readonly archival: ArchivalMemory;
  private readonly snapshotMdPath: string;
  private readonly migrationMarkerPath: string;
  private readonly evidenceIndexPath: string;
  private readonly renderer: PatternRenderer;
  private migrated = false;

  constructor(agentDir: string, archival: ArchivalMemory) {
    this.agentDir = agentDir;
    this.archival = archival;
    this.snapshotMdPath = path.join(agentDir, 'Patterns.md');
    this.migrationMarkerPath = path.join(agentDir, 'archival', '.pattern-migration-v1.json');
    this.evidenceIndexPath = path.join(agentDir, 'patterns', 'evidence-index.json');
    this.renderer = new PatternRenderer(agentDir, archival);
  }

  /** 启动时一次性迁移旧数据 */
  async initialize(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;
    if (existsSync(this.migrationMarkerPath)) return;

    const startedAt = Date.now();
    const result = await migratePatternsToArchival(this.archival, this.agentDir).catch(() => null);
    mkdirSync(path.dirname(this.migrationMarkerPath), { recursive: true });
    writeFileSync(this.migrationMarkerPath, JSON.stringify({
      version: 1,
      migratedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      patternsMigrated: result?.patternsMigrated ?? 0,
      reflectionsMigrated: result?.reflectionsMigrated ?? 0,
    }, null, 2), 'utf-8');
  }

  async sync_turn(data: TurnCognitiveData): Promise<void> {
    const signals = detectCorrections(data.userMessage);

    // 回写 outcome（供 PracticeLogger 落盘使用）
    if (signals.length > 0) {
      data.outcome.userCorrections = (data.outcome.userCorrections ?? 0) + signals.length;
      (data.outcome as Record<string, unknown>)['correctionSignals'] = signals;
    }

    await extractAndIngest(data, signals, this.archival);

    // 若检测到工具失败，额外写入 Reflexion 反思
    const failed = data.toolCalls.filter(t => !t.success);
    if (failed.length > 0) {
      await ingestReflectionToArchival(this.archival, {
        scene: data.userMessage,
        toolChain: data.toolCalls.map(t => t.name),
        failureReason: failed.map(t => `${t.name}: ${t.result}`).join('; '),
        lesson: `工具链在当前场景下不可靠，建议寻找替代路径`,
        tryNextTime: `避免 ${failed.map(t => t.name).join(', ')} 路径`,
      }).catch(() => {/* ignore */});
    }
  }

  async prefetch(query: string): Promise<string | null> {
    const results = await this.archival.search(query, { limit: 5, tags: ['pattern'] });
    if (results.length === 0) return null;

    const parts = ['## Relevant Patterns\n'];
    for (const r of results) {
      parts.push(`- [score: ${r.score.toFixed(2)}] ${r.text.split('\n')[0]}`);
    }
    return parts.join('\n');
  }

  async system_prompt_block(): Promise<string> {
    if (existsSync(this.snapshotMdPath)) {
      const content = readFileSync(this.snapshotMdPath, 'utf-8').trim();
      if (content) {
        return `## Experience Patterns Snapshot\n\n${content}`;
      }
    }
    return '';
  }

  async on_session_end(_messages: unknown[]): Promise<void> {
    await this.renderer.regenerate();
  }

  async ingestPatternEvidence(candidates: PatternEvidenceCandidate[]): Promise<void> {
    const file = this.readEvidenceIndex();
    for (const candidate of candidates) {
      const existing = file.data[candidate.stableKey];
      if (existing && existing.proofCount === candidate.proofCount) continue;
      if (existing) this.archival.delete(existing.archivalId);
      const text = [
        `[${candidate.polarity.toUpperCase()}] ${candidate.content}`,
        `适用范围: ${candidate.applicability}`,
        `证据数: ${candidate.proofCount}`,
      ].join('\n');
      const archivalId = await this.archival.insert(text, [
        'pattern',
        candidate.polarity,
        `owner:${candidate.ownerScope}:${candidate.ownerId}`,
        `applicability:${candidate.applicability}`,
        ...(candidate.sourceSkillId ? [`source-skill:${candidate.sourceSkillId}`] : []),
      ]);
      file.data[candidate.stableKey] = {
        archivalId,
        proofCount: candidate.proofCount,
        evidenceIds: candidate.evidenceRefs.map((evidence) => evidence.id),
        updatedAt: new Date().toISOString(),
      };
    }
    this.writeEvidenceIndex(file);
  }

  private readEvidenceIndex(): CognitionDataFile<PatternEvidenceIndex> {
    if (existsSync(this.evidenceIndexPath)) {
      try {
        return JSON.parse(readFileSync(this.evidenceIndexPath, 'utf8')) as CognitionDataFile<PatternEvidenceIndex>;
      } catch {
        // Rebuild the lightweight index as candidates are routed again.
      }
    }
    const now = new Date().toISOString();
    return { version: '1.0', createdAt: now, updatedAt: now, data: {} };
  }

  private writeEvidenceIndex(file: CognitionDataFile<PatternEvidenceIndex>): void {
    mkdirSync(path.dirname(this.evidenceIndexPath), { recursive: true });
    file.updatedAt = new Date().toISOString();
    const temporaryPath = `${this.evidenceIndexPath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, this.evidenceIndexPath);
  }
}
