import type { MemoryBlock } from './types';

/** Parse the public Memory.md format without constructing a writable Memory instance. */
export function parseBlocksFromMarkdown(content: string): Map<string, MemoryBlock> {
  const blocks = new Map<string, MemoryBlock>();
  let label: string | null = null;
  let description = '';
  let limit = 2000;
  let readOnly = false;
  const value: string[] = [];

  const flush = () => {
    if (!label) return;
    blocks.set(label, {
      label,
      value: value.join('\n').trim(),
      limit,
      description: description || label,
      metadata: {},
      readOnly,
    });
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading?.[1]) {
      flush();
      label = heading[1].trim();
      description = '';
      limit = 2000;
      readOnly = false;
      value.length = 0;
      continue;
    }
    if (!label || line === '# Memory') continue;
    const metadata = line.match(/^\{(description|limit|readOnly):\s*(.*?)\}$/);
    if (metadata?.[1]) {
      if (metadata[1] === 'description') description = metadata[2] ?? '';
      if (metadata[1] === 'limit') limit = Number.parseInt(metadata[2] ?? '', 10) || 2000;
      if (metadata[1] === 'readOnly') readOnly = metadata[2] === 'true';
      continue;
    }
    value.push(line);
  }
  flush();
  return blocks;
}

