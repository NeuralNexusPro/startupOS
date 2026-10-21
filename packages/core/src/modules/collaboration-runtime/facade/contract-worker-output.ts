import { promises as fs } from 'node:fs';

import { parseCollaborationArtifactRef } from './artifact-reference';

interface ContractArtifactEnvelopeProjection {
  schemaVersion?: string;
  content?: string;
}

function formatBusinessValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => `- ${formatBusinessValue(item)}`).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `**${key}**：${formatBusinessValue(child)}`)
      .join('\n\n');
  }
  return String(value);
}

export function presentContractWorkerContent(content: unknown): string | undefined {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const record = content as Record<string, unknown>;
  if (typeof record['summary'] === 'string' && record['summary'].trim()) {
    return record['summary'].trim();
  }
  const outcome = record['outcome'];
  if (outcome && typeof outcome === 'object' && !Array.isArray(outcome)) {
    const outputs = (outcome as Record<string, unknown>)['outputs'];
    if (Array.isArray(outputs)) {
      const rendered = outputs.flatMap((output) => {
        if (!output || typeof output !== 'object' || Array.isArray(output)) return [];
        const value = (output as Record<string, unknown>)['value'];
        const text = formatBusinessValue(value).trim();
        return text ? [text] : [];
      });
      if (rendered.length) return rendered.join('\n\n---\n\n');
    }
  }
  if (typeof record['result'] === 'string' && record['result'] !== 'success') {
    return record['result'];
  }
  return undefined;
}

export async function readContractWorkerOutput(
  dataRoot: string,
  refs: readonly string[],
): Promise<string | undefined> {
  for (const ref of refs) {
    if (!ref.startsWith('artifact://collaboration/')) continue;
    try {
      const raw = await fs.readFile(parseCollaborationArtifactRef(dataRoot, ref), 'utf8');
      const envelope = JSON.parse(raw) as ContractArtifactEnvelopeProjection;
      if (typeof envelope.content !== 'string') continue;
      const presented = presentContractWorkerContent(JSON.parse(envelope.content) as unknown);
      if (presented) return presented;
    } catch {
      // A missing/corrupt internal receipt must not break runtime status or projection reads.
    }
  }
  return undefined;
}
