import type { AgentMessage } from '@originos/pi-agent-adapter';

export interface RuntimeWorkingSummary {
  currentTask?: string;
  failureReason?: string;
  doNotRepeat?: string;
}

type SyntheticSystemMessage = {
  role: 'system';
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

function hasContent(message: AgentMessage): message is AgentMessage & { content: unknown[] } {
  return 'content' in message && Array.isArray((message as { content?: unknown }).content);
}

function getTextContent(message: AgentMessage): string {
  if (!hasContent(message)) return '';
  return message.content
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text as string)
    .join('\n')
    .trim();
}

/**
 * 合成注入的消息不得反哺下一轮 summary，否则会逐轮自我放大：
 * - system 角色消息只可能是运行时合成注入（Working Summary、loop 告警）；
 * - 访谈问候触发指令由 Web API 以 user 角色注入，前缀须与该指令保持一致
 *   （见 web `api/agent/projects/[projectId]/messages` 的 SYSTEM_GREETING_PROMPT），
 *   其中的“不要重复已确认的内容”是给 Agent 的指令，不是用户纠错。
 */
function isSyntheticInjection(message: AgentMessage): boolean {
  if (String((message as { role?: string }).role ?? '') === 'system') return true;
  const text = getTextContent(message);
  return text.includes('[Working Summary]') || text.startsWith('系统启动触发');
}

function normalizeLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractFailureReason(text: string): string | undefined {
  const lines = text.split('\n').map((line) => normalizeLine(line)).filter(Boolean);
  for (const line of lines) {
    if (
      line.includes('失败原因') ||
      line.includes('Error:') ||
      line.includes('error:') ||
      line.includes('not found') ||
      line.includes('不存在')
    ) {
      return line;
    }
  }
  return undefined;
}

function extractDoNotRepeat(text: string): string | undefined {
  const lines = text.split('\n').map((line) => normalizeLine(line)).filter(Boolean);
  for (const line of lines) {
    if (
      line.includes('不要重复') ||
      line.includes('停止重复') ||
      line.includes('不再沿用') ||
      line.includes('换一种方式') ||
      line.includes('改为')
    ) {
      return line;
    }
  }
  return undefined;
}

export function buildRuntimeWorkingSummary(messages: AgentMessage[]): RuntimeWorkingSummary {
  const currentTask = [...messages]
    .reverse()
    .find((message) => message.role === 'user' && !isSyntheticInjection(message));
  const currentTaskText = currentTask ? normalizeLine(getTextContent(currentTask)).slice(0, 200) : undefined;

  let failureReason: string | undefined;
  let doNotRepeat: string | undefined;

  for (const message of [...messages].reverse()) {
    if (isSyntheticInjection(message)) continue;
    const text = getTextContent(message);
    if (!text) continue;

    if (!failureReason) {
      failureReason = extractFailureReason(text);
    }
    if (!doNotRepeat) {
      doNotRepeat = extractDoNotRepeat(text);
    }

    if (failureReason && doNotRepeat) {
      break;
    }
  }

  return {
    currentTask: currentTaskText,
    failureReason,
    doNotRepeat,
  };
}

export function createWorkingSummaryMessage(messages: AgentMessage[]): AgentMessage | null {
  const summary = buildRuntimeWorkingSummary(messages);
  if (!summary.currentTask && !summary.failureReason && !summary.doNotRepeat) {
    return null;
  }

  const lines = ['[Working Summary]'];
  if (summary.currentTask) {
    lines.push(`当前任务：${summary.currentTask}`);
  }
  if (summary.failureReason) {
    lines.push(`最近失败原因：${summary.failureReason}`);
  }
  if (summary.doNotRepeat) {
    lines.push(`禁止重复动作：${summary.doNotRepeat}`);
  }

  const message: SyntheticSystemMessage = {
    role: 'system',
    content: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  };

  return message as unknown as AgentMessage;
}
