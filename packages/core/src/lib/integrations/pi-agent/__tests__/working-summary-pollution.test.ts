import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@originos/pi-agent-adapter';
import { buildRuntimeWorkingSummary, createWorkingSummaryMessage } from '../runtime-working-summary';

function textMessage(role: string, text: string): AgentMessage {
  return {
    role,
    content: [{ type: 'text', text }],
  } as AgentMessage;
}

describe('runtime working summary self-pollution guard', () => {
  it('ignores persisted [Working Summary] system messages so the prefix chain stops compounding', () => {
    const userLine = '请继续处理上次任务，不要重复已确认的内容';
    // 模拟已持久化的合成消息：上一轮 summary 的 doNotRepeat 已带一层前缀。
    const persisted = textMessage('system', '[Working Summary]\n当前任务：请继续处理上次任务\n禁止重复动作：' + userLine);

    const summary = buildRuntimeWorkingSummary([
      textMessage('user', userLine),
      textMessage('assistant', '最近失败原因：old-plan.md 不存在'),
      persisted,
      persisted,
    ]);

    // 若未过滤，倒序扫描会先命中持久化消息，doNotRepeat 会被再次加上「禁止重复动作：」前缀。
    expect(summary.doNotRepeat).toBe(userLine);
    expect(summary.currentTask).toContain('请继续处理上次任务');
    expect(summary.failureReason).toContain('old-plan.md');
  });

  it('does not treat the greeting trigger prompt as current task or do-not-repeat signal', () => {
    const summary = buildRuntimeWorkingSummary([
      textMessage('user', '系统启动触发：先检查已恢复的对话历史，从历史中断处自然继续，不要重复已确认的内容，更不要从头开始访谈'),
      textMessage('user', '先聊聊你们供应商来料检验的流程吧'),
    ]);

    expect(summary.currentTask).toContain('供应商来料检验');
    expect(summary.doNotRepeat).toBeUndefined();
  });

  it('ignores synthetic loop-warning system messages', () => {
    // applyLoopProtection 注入的告警 = 循环描述 + [Working Summary] 全文。
    const loopWarning = textMessage('system', '检测到可能的循环：read_file x8\n\n[Working Summary]\n当前任务：请继续读取报价文件\n禁止重复动作：不要重复 read_file');
    const summary = buildRuntimeWorkingSummary([
      textMessage('user', '请继续读取报价文件'),
      textMessage('assistant', '最近失败原因：报价文件不存在，不要重复 read_file，改为询问用户路径'),
      loopWarning,
    ]);

    expect(summary.currentTask).toContain('请继续读取报价文件');
    expect(summary.doNotRepeat).not.toContain('禁止重复动作');
    expect(summary.doNotRepeat).toContain('不要重复 read_file');
  });
});
