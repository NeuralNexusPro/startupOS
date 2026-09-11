/**
 * 知识库 Provider（重构：UnifiedOntology 为主存储）
 *
 * 主存储：knowledge/ontology.json（UnifiedOntology JSON 序列化）
 * 衍生视图：knowledge/wiki/*.md、knowledge/index.md、knowledge/log.md
 * Frozen Snapshot：Knowledge.md（启动时加载到 prompt）
 *
 * 所有知识最终都以文件形式持久化到 agent/project 目录。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import type { CognitiveProvider, TurnCognitiveData } from './types';
import { UnifiedOntology, type Entity } from './unified-ontology';
import type { KnowledgeCognitionCandidate } from '../../../../modules/memory-core/bank';
import type { KnowledgeCandidateBatch } from '../../../../modules/memory-core';

// ============================================================================
// 知识提取接口
// ============================================================================

interface ExtractedKnowledge {
  entities: Array<{ name: string; type: string; attributes: Record<string, unknown> }>;
  facts: string[];
}

// ============================================================================
// KnowledgeProvider
// ============================================================================

export class KnowledgeProvider implements CognitiveProvider {
  readonly name = 'knowledge';

  private readonly agentDir: string;
  private readonly knowledgeDir: string;
  private readonly ontologyPath: string;         // knowledge/ontology.json（对话知识）
  private readonly businessOntologyPath: string; // knowledge/business-ontology.json（业务模型）
  private readonly wikiDir: string;
  private readonly indexMdPath: string;
  private readonly logMdPath: string;
  private readonly snapshotMdPath: string;

  /** 对话中提取的知识本体 */
  private ontology: UnifiedOntology;
  /** 从 business-model.json 导入的业务本体（独立存储，只读） */
  private businessOntology: UnifiedOntology | null;

  constructor(agentDir: string) {
    this.agentDir = agentDir;
    this.knowledgeDir = path.join(agentDir, 'knowledge');
    this.ontologyPath = path.join(this.knowledgeDir, 'ontology.json');
    this.businessOntologyPath = path.join(this.knowledgeDir, 'business-ontology.json');
    this.wikiDir = path.join(this.knowledgeDir, 'wiki');
    this.indexMdPath = path.join(this.knowledgeDir, 'index.md');
    this.logMdPath = path.join(this.knowledgeDir, 'log.md');
    this.snapshotMdPath = path.join(agentDir, 'Knowledge.md');

    // 加载两份本体
    this.ontology = this.loadOrCreateOntology();
    this.businessOntology = this.loadBusinessOntology();
    this.ensureKnowledgeDir();
  }

  /** 获取对话知识本体（可写） */
  getOntology(): UnifiedOntology {
    return this.ontology;
  }

  /** 获取业务本体（只读） */
  getBusinessOntology(): UnifiedOntology | null {
    return this.businessOntology;
  }

  /** 联合查询：对话知识 + 业务本体 */
  queryCombined(filter: Parameters<UnifiedOntology['query']>[0]): Entity[] {
    const results = this.ontology.query(filter);
    if (this.businessOntology) {
      results.push(...this.businessOntology.query(filter));
    }
    return results;
  }

  async sync_turn(data: TurnCognitiveData): Promise<void> {
    const extracted = this.extractKnowledge(data);
    if (extracted.entities.length === 0 && extracted.facts.length === 0) return;

    // 1. 写入统一本体
    for (const ent of extracted.entities) {
      // 避免重复创建同名同类型实体
      const existing = this.ontology.entities.find(
        e => e.name === ent.name && e.type === ent.type
      );
      if (!existing) {
        this.ontology.createEntity(ent.type, ent.name, ent.attributes);
      }
    }
    this.saveOntology();

    // 2. 更新衍生 wiki 页面
    this.writeWikiPages(extracted);
    this.updateIndex(extracted);
    this.appendLog(data.turnNumber, extracted);

    // 3. 更新 Frozen Snapshot
    this.exportSnapshot();
  }

  async prefetch(query: string): Promise<string | null> {
    const keywords = query.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length === 0) return null;

    // 联合查询
    const matched: Entity[] = [];
    for (const kw of keywords) {
      matched.push(...this.ontology.query({ type: kw }));
      matched.push(...this.ontology.query({ attributeKey: 'name', attributeValue: kw }));
      if (this.businessOntology) {
        matched.push(...this.businessOntology.query({ type: kw }));
        matched.push(...this.businessOntology.query({ attributeKey: 'name', attributeValue: kw }));
      }
    }

    if (matched.length === 0) {
      const firstKw = keywords[0];
      return firstKw ? this.searchWikiForMatch(firstKw) : null;
    }

    const unique = new Map<string, Entity>();
    for (const e of matched) unique.set(e.id, e);

    const lines: string[] = [];
    for (const e of unique.values()) {
      const attrs = e.attributes.map(a => `${a.key}: ${formatAttrValue(a.value)}`).join(', ');
      lines.push(`- **${e.name}** (type: ${e.type}) ${attrs ? `— ${attrs}` : ''}`);
    }
    return lines.join('\n');
  }

  async system_prompt_block(): Promise<string> {
    if (existsSync(this.snapshotMdPath)) {
      try {
        const content = readFileSync(this.snapshotMdPath, 'utf-8');
        if (content.trim()) {
          return `## Knowledge Base Snapshot\n\n以下是知识库快照（Knowledge.md），包含当前认知世界的知识索引：\n\n${content}`;
        }
      } catch {
        // ignore
      }
    }
    return '';
  }

  async ingestCandidates(candidates: KnowledgeCandidateBatch[]): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    const merged: ExtractedKnowledge = {
      entities: [],
      facts: [],
    };

    for (const candidate of candidates) {
      for (const entity of candidate.entities) {
        if (!merged.entities.some((existing) => existing.name === entity.name && existing.type === entity.type)) {
          merged.entities.push(entity);
        }
      }
      for (const fact of candidate.facts) {
        if (!merged.facts.includes(fact)) {
          merged.facts.push(fact);
        }
      }
    }

    for (const entity of merged.entities) {
      const existing = this.ontology.entities.find(
        (current) => current.name === entity.name && current.type === entity.type
      );
      if (!existing) {
        this.ontology.createEntity(entity.type, entity.name, entity.attributes);
      }
    }

    this.saveOntology();
    this.writeWikiPages(merged);
    this.updateIndex(merged);
    this.exportSnapshot();
  }

  async ingestCognitionCandidates(candidates: KnowledgeCognitionCandidate[]): Promise<void> {
    await this.ingestCandidates(candidates.map((candidate) => ({
      entities: [],
      facts: [candidate.content],
    })));
  }

  // ==========================================================================
  // 内部方法
  // ==========================================================================

  private loadOrCreateOntology(): UnifiedOntology {
    if (existsSync(this.ontologyPath)) {
      try {
        const content = readFileSync(this.ontologyPath, 'utf-8');
        return UnifiedOntology.fromJSON(content);
      } catch (err) {
        console.warn('[KnowledgeProvider] Failed to load ontology.json, creating new:', err);
      }
    }
    return new UnifiedOntology({
      id: 'knowledge-ontology',
      projectId: path.basename(this.agentDir),
      name: 'Knowledge Ontology',
    });
  }

  private loadBusinessOntology(): UnifiedOntology | null {
    if (existsSync(this.businessOntologyPath)) {
      try {
        const content = readFileSync(this.businessOntologyPath, 'utf-8');
        return UnifiedOntology.fromJSON(content);
      } catch (err) {
        console.warn('[KnowledgeProvider] Failed to load business-ontology.json:', err);
      }
    }
    return null;
  }

  private saveOntology(): void {
    this.ontology.saveToFile(this.ontologyPath);
  }

  private ensureKnowledgeDir(): void {
    if (!existsSync(this.knowledgeDir)) {
      mkdirSync(this.knowledgeDir, { recursive: true });
    }
    if (!existsSync(this.wikiDir)) {
      mkdirSync(this.wikiDir, { recursive: true });
    }

    if (!existsSync(this.indexMdPath)) {
      writeFileSync(this.indexMdPath, this.getDefaultIndex(), 'utf-8');
    }
    if (!existsSync(this.logMdPath)) {
      writeFileSync(this.logMdPath, this.getDefaultLog(), 'utf-8');
    }
    // 初始化时如无 snapshot，从当前本体导出一份
    if (!existsSync(this.snapshotMdPath)) {
      this.exportSnapshot();
    }
  }

  /** 导出 Frozen Snapshot：合并对话知识 + 业务本体 */
  private exportSnapshot(): void {
    try {
      let markdown = this.ontology.toMarkdown();
      if (this.businessOntology) {
        markdown += '\n\n---\n\n# Business Ontology\n\n' + this.businessOntology.toMarkdown();
      }
      writeFileSync(this.snapshotMdPath, markdown, 'utf-8');
    } catch (err) {
      console.error('[KnowledgeProvider] Failed to export snapshot:', err);
    }
  }

  /** 简单的知识提取（启发式） */
  private extractKnowledge(data: TurnCognitiveData): ExtractedKnowledge {
    const entities: Array<{ name: string; type: string; attributes: Record<string, unknown> }> = [];
    const facts: string[] = [];

    // 从用户消息中提取专有名词
    const entityRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = entityRegex.exec(data.userMessage)) !== null) {
      if (match[1] && !entities.some(e => e.name === match![1]) && match[1].length > 2) {
        entities.push({ name: match[1], type: 'Concept', attributes: { source: 'conversation', turn: data.turnNumber } });
      }
    }

    // 从助手思考过程中提取关键信息
    if (data.assistantThinking && data.assistantThinking.length > 20 && data.assistantThinking.length < 2000) {
      facts.push(`Turn #${data.turnNumber}: [thinking] ${data.assistantThinking.slice(0, 500)}`);
    }

    // 从工具调用结果中提取关键信息
    for (const toolCall of data.toolCalls) {
      if (toolCall.success && toolCall.result.length > 50 && toolCall.result.length < 2000) {
        facts.push(`Turn #${data.turnNumber}: ${toolCall.name} → ${toolCall.result.slice(0, 200)}`);
      }
    }

    return { entities, facts };
  }

  private writeWikiPages(extracted: ExtractedKnowledge): void {
    for (const ent of extracted.entities) {
      const fileName = `${ent.name.toLowerCase().replace(/\s+/g, '-')}.md`;
      const entityFile = path.join(this.wikiDir, fileName);
      if (!existsSync(entityFile)) {
        const content = this.buildEntityWiki(ent);
        writeFileSync(entityFile, content, 'utf-8');
      }
    }
  }

  private buildEntityWiki(ent: { name: string; type: string; attributes: Record<string, unknown> }): string {
    const attrLines = Object.entries(ent.attributes)
      .map(([k, v]) => `- **${k}**: ${formatAttrValue(v)}`)
      .join('\n');
    return `# ${ent.name}\n\n**类型:** ${ent.type}\n\n## 属性\n\n${attrLines || '（无）'}\n\n## 关系\n\n- 待补充\n\n## 来源\n\n- 对话提取（knowledge/ontology.json 主存储）\n`;
  }

  private updateIndex(extracted: ExtractedKnowledge): void {
    if (extracted.entities.length === 0) return;

    try {
      let indexContent = readFileSync(this.indexMdPath, 'utf-8');
      for (const ent of extracted.entities) {
        if (!indexContent.includes(ent.name)) {
          const fileName = ent.name.toLowerCase().replace(/\s+/g, '-');
          indexContent += `\n- [\`${ent.name}\`](wiki/${fileName}.md) — ${ent.type}`;
        }
      }
      writeFileSync(this.indexMdPath, indexContent, 'utf-8');
    } catch {
      // ignore
    }
  }

  private appendLog(turnNumber: number, extracted: ExtractedKnowledge): void {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const names = extracted.entities.map(e => e.name).join(', ') || '无';
    const logEntry = `## Turn #${turnNumber} (${timestamp})\n\n**新增实体:** ${names}\n\n---\n\n`;
    try {
      appendFileSync(this.logMdPath, logEntry, 'utf-8');
    } catch {
      // ignore
    }
  }

  private searchWikiForMatch(keyword: string): string | null {
    if (!existsSync(this.wikiDir)) return null;

    try {
      const files = require('fs').readdirSync(this.wikiDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = readFileSync(path.join(this.wikiDir, file), 'utf-8');
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
          return content.slice(0, 1500);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private getDefaultIndex(): string {
    return `# Knowledge Index\n\n## 实体\n\n（尚无实体）\n\n## 概念\n\n（尚无概念）\n\n> 结构化数据见 \`knowledge/ontology.json\`\n`;
  }

  private getDefaultLog(): string {
    return `# Knowledge Log\n\n（暂无变更记录）\n`;
  }
}

function formatAttrValue(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}
