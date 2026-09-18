import type { MemoryBlock } from './cognitive/types';

export interface PromptMemoryContract {
  memoryBlocks?: MemoryBlock[] | null;
  memoryMd?: string | null;
  knowledgeMd?: string | null;
  patternsMd?: string | null;
}

export interface PromptMemorySections {
  coreMemorySection: string;
  stableMemorySection: string;
  knowledgeSection: string;
  patternsSection: string;
}

interface BuildPromptMemorySectionsOptions extends PromptMemoryContract {
  stableMemoryHeading?: string;
  knowledgeHeading?: string;
  patternsHeading?: string;
  maxStableMemoryChars?: number;
  maxCatalogChars?: number;
}

export const DEFAULT_COGNITIVE_CATALOG_MAX_CHARS = 1600;

export function buildPromptMemorySections(
  options: BuildPromptMemorySectionsOptions,
): PromptMemorySections {
  const coreMemorySection = options.memoryBlocks && options.memoryBlocks.length > 0
    ? `\n### Core Memory\n\n<memory_blocks>\nThe following memory blocks are currently engaged in your core memory unit:\n\n${renderMemoryBlocksXML(options.memoryBlocks)}\n</memory_blocks>`
    : '';

  const stableMemorySection = (!options.memoryBlocks || options.memoryBlocks.length === 0) && options.memoryMd
    ? `\n### ${options.stableMemoryHeading ?? 'Long-term Stable Memory'}\n\n${toStableMemoryExcerpt(
        options.memoryMd,
        options.maxStableMemoryChars ?? 4000,
      )}`
    : '';

  const knowledgeSection = buildCognitiveCatalogSection(
    options.knowledgeMd,
    options.knowledgeHeading ?? 'Knowledge Base Snapshot',
    'Knowledge.md',
    options.maxCatalogChars,
  );

  const patternsSection = buildCognitiveCatalogSection(
    options.patternsMd,
    options.patternsHeading ?? 'Experience Patterns Snapshot',
    'Patterns.md',
    options.maxCatalogChars,
  );

  return {
    coreMemorySection,
    stableMemorySection,
    knowledgeSection,
    patternsSection,
  };
}

export function renderMarkdownHeadingCatalog(
  markdown: string,
  maxChars = DEFAULT_COGNITIVE_CATALOG_MAX_CHARS,
): string {
  if (maxChars <= 0 || !markdown.trim()) return '';

  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{2,4}\s+\S/.test(line))
    .join('\n')
    .slice(0, maxChars)
    .trimEnd();
}

function buildCognitiveCatalogSection(
  markdown: string | null | undefined,
  heading: string,
  fileName: 'Knowledge.md' | 'Patterns.md',
  maxChars = DEFAULT_COGNITIVE_CATALOG_MAX_CHARS,
): string {
  if (!markdown?.trim()) return '';

  const catalog = renderMarkdownHeadingCatalog(markdown, maxChars);
  const emptyCatalog = '（目录中暂无二至四级标题）';
  return `\n### ${heading}\n\n**目录索引：**\n\`\`\`markdown\n${catalog || emptyCatalog}\n\`\`\`\n\n需要详情时，使用 \`read_file\` 读取 \`${fileName}\` 全文。`;
}

export function toStableMemoryExcerpt(memoryMd: string, maxChars: number): string {
  const normalized = memoryMd.trim();
  if (!normalized) return '';

  const sections = normalized
    .split(/\n(?=##\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  const preferredSection = sections.find((section) => section.startsWith('## 更新记忆'))
    ?? sections.find((section) => section.startsWith('## '))
    ?? normalized;

  if (preferredSection.length <= maxChars) {
    return preferredSection;
  }

  return `${preferredSection.slice(0, maxChars).trim()}\n\n[长期记忆摘要已截断，更多内容请通过 memory / read_file 按需读取]`;
}

export function renderMemoryBlocksXML(blocks: MemoryBlock[]): string {
  const lines: string[] = [];
  blocks.forEach((block, idx) => {
    const label = block.label || 'block';
    const value = block.value || '';
    const desc = block.description || '';
    const charsCurrent = value.length;
    const limit = block.limit || 0;

    lines.push(`<${label}>`);
    lines.push('<description>');
    lines.push(desc);
    lines.push('</description>');
    lines.push('<metadata>');
    if (block.readOnly) lines.push('- read_only=true');
    lines.push(`- chars_current=${charsCurrent}`);
    lines.push(`- chars_limit=${limit}`);
    lines.push('</metadata>');
    lines.push('<value>');
    lines.push(value);
    lines.push('</value>');
    lines.push(`</${label}>`);
    if (idx !== blocks.length - 1) lines.push('');
  });
  return lines.join('\n');
}
