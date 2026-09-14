/**
 * Pattern 信号提取 + Archival 写入
 *
 * 分类规则：
 *   positive = resolved && no corrections && toolCalls > 0 && no errors
 *   negative = !resolved || corrections > 0 || any tool error
 *   skip     = no toolCalls (pure dialogue)
 */

import type { TurnCognitiveData } from '../../../../integrations/pi-agent/cognitive/types';
import type { PatternIngestPayload, PatternPolarity } from '../../../../integrations/pi-agent/cognitive/pattern/types';
import type { CorrectionSignal } from '../../../../integrations/pi-agent/cognitive/pattern/types';
import { maxStrength } from '../../../../integrations/pi-agent/cognitive/pattern/correction-detector';
import { ArchivalMemory } from '../../../../../modules/memory-core/archival/archival-memory';

function classify(data: TurnCognitiveData): PatternPolarity | 'skip' {
  if (data.toolCalls.length === 0) return 'skip';
  const corrections = data.outcome.userCorrections ?? 0;
  const anyError = data.toolCalls.some(t => !t.success);
  if (!data.outcome.resolved || corrections > 0 || anyError) return 'negative';
  return 'positive';
}

function buildPositiveText(payload: PatternIngestPayload): string {
  const scene = summarizeScene(payload.scene, payload.toolChain);
  const parts = [`[POSITIVE] ${scene}`];
  parts.push(`路径: ${payload.toolChain.join(' → ')}`);
  const summary = summarizeToolResult(payload.resultSummary);
  if (summary) parts.push(`结果摘要: ${summary}`);
  return parts.join('\n');
}

function buildNegativeText(payload: PatternIngestPayload): string {
  const scene = summarizeScene(payload.scene, payload.toolChain);
  const parts = [`[NEGATIVE] ${scene}`];
  parts.push(`路径: ${payload.toolChain.join(' → ')}`);
  const failureReason = summarizeToolResult(payload.failureReason);
  if (failureReason) parts.push(`失败原因: ${failureReason}`);
  if (payload.userFeedback) parts.push(`用户反馈: "${payload.userFeedback}"`);
  parts.push(`教训: 避免在类似场景使用该路径`);
  return parts.join('\n');
}

function summarizeScene(scene: string, toolChain: string[]): string {
  const cleaned = compactText(scene);
  if (cleaned) return `场景: ${cleaned.slice(0, 120)}`;
  return `场景: 使用 ${toolChain.join(' → ')} 处理任务`;
}

function summarizeToolResult(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.trim();
  const parsed = tryParseJson(text);
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    const success = typeof record["success"] === 'boolean' ? `success=${String(record["success"])}` : null;
    const exitCode = typeof record["exitCode"] === 'number' ? `exitCode=${record["exitCode"]}` : null;
    const filePath = typeof record["filePath"] === 'string' ? `file=${basename(record["filePath"])}` : null;
    const count = typeof record["count"] === 'number' ? `count=${record["count"]}` : null;
    const command = typeof record["command"] === 'string' ? `command=${summarizeCommand(record["command"])}` : null;
    const message = typeof record["message"] === 'string' ? compactText(record["message"]).slice(0, 80) : null;
    const parts = [success, exitCode, filePath, count, command, message].filter(Boolean);
    if (parts.length > 0) return parts.join('；');
  }
  return compactText(stripJsonNoise(text)).slice(0, 120);
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripJsonNoise(text: string): string {
  if (/^\s*[{[]/.test(text)) return '工具返回结构化结果，详见实践日志';
  return text;
}

function summarizeCommand(command: string): string {
  return compactText(command)
    .replace(/(["']).*?\1/g, '$1...$1')
    .slice(0, 80);
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function sceneTags(scene: string): string[] {
  return scene
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9\u4e00-\u9fff]/g, ''))
    .filter(w => w.length > 3)
    .slice(0, 5);
}

export async function extractAndIngest(
  data: TurnCognitiveData,
  correctionSignals: CorrectionSignal[],
  archival: ArchivalMemory,
): Promise<void> {
  const polarity = classify(data);
  if (polarity === 'skip') return;

  const toolChain = data.toolCalls.map(t => t.name);
  const firstResult = data.toolCalls.find(t => t.success && t.result)?.result ?? '';
  const firstError = data.toolCalls.find(t => !t.success)?.result ?? '';
  const strength = maxStrength(correctionSignals);

  const payload: PatternIngestPayload = {
    polarity,
    scene: data.userMessage,
    toolChain,
    resultSummary: polarity === 'positive' ? firstResult : undefined,
    failureReason: polarity === 'negative' ? (firstError || 'unresolved') : undefined,
    userFeedback: correctionSignals[0]?.excerpt,
    correctionStrength: strength ?? undefined,
  };

  const text = polarity === 'positive'
    ? buildPositiveText(payload)
    : buildNegativeText(payload);

  const tags: string[] = [
    'pattern',
    polarity,
    ...toolChain,
    ...sceneTags(data.userMessage),
  ];
  if (polarity === 'negative' && strength) {
    tags.push(`correction-${strength}`);
  }

  await archival.insert(text, tags);
}
