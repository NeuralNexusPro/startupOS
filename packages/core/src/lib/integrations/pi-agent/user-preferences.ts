import { readUserConfig } from '../../storage/user-config';

export type GlobalUserLanguage = 'zh-CN' | 'en-US' | 'ja-JP';

function languageLabel(language: GlobalUserLanguage): string {
  switch (language) {
    case 'en-US':
      return 'English';
    case 'ja-JP':
      return '日本語';
    case 'zh-CN':
    default:
      return '简体中文';
  }
}

export function getGlobalUserLanguage(): GlobalUserLanguage {
  const config = readUserConfig();
  const language = config.preferences?.language;
  if (language === 'en-US' || language === 'ja-JP' || language === 'zh-CN') {
    return language;
  }
  return 'zh-CN';
}

export function buildGlobalUserPreferencesPrompt(): string {
  const language = getGlobalUserLanguage();
  return [
    '## Global User Preferences',
    '',
    `- Preferred response language: ${languageLabel(language)} (\`${language}\`)`,
    '- Unless the user explicitly requests another language, respond in the preferred language above.',
    '- Keep terminology, summaries, clarifications, and final answers consistent with this language preference.',
  ].join('\n');
}

export function appendGlobalUserPreferencesPrompt(prompt: string): string {
  const block = buildGlobalUserPreferencesPrompt();
  if (!prompt.trim()) {
    return block;
  }
  return `${prompt}\n\n---\n\n${block}`;
}
