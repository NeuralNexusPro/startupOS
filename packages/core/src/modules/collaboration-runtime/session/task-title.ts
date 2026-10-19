const DEFAULT_MAX_LENGTH = 20;

function cleanTitleSource(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[\s#>*\-\d.)、]+/, '')
    .replace(/^【[^】]+】\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a concise, stable board title without invoking an LLM. */
export function deriveTaskTitle(description: string, preferredTitle?: string): string {
  const preferred = preferredTitle ? cleanTitleSource(preferredTitle) : '';
  const source = preferred || cleanTitleSource(description);
  if (!source) {
    return '未命名任务';
  }

  let candidate = source
    .split(/[。！？!?；;\n]/, 1)[0]?.trim() || source;
  const leadingClause = candidate.split(/[，,]/, 1)[0]?.trim();
  if (leadingClause && leadingClause.length >= 6) {
    candidate = leadingClause;
  }
  if (!preferred) {
    candidate = candidate
      .replace(/^(?:现在请|请你|请执行|请完成|请阅读|请整理)/, '')
      .replace(/^你此前已/, '')
      .trim();
  }

  if (candidate.length <= DEFAULT_MAX_LENGTH) {
    return candidate || '未命名任务';
  }
  return `${candidate.slice(0, DEFAULT_MAX_LENGTH - 1).trimEnd()}…`;
}
