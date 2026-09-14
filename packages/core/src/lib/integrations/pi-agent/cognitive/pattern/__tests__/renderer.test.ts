import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { PatternRenderer } from '../../../../../features/agent/cognitive/pattern/renderer';

function makeArchival(entries: Array<{ text: string; tags: string[]; createdAt?: number }>) {
  return {
    getAll: () => entries.map((entry, index) => ({
      id: `entry-${index}`,
      text: entry.text,
      tags: entry.tags,
      createdAt: entry.createdAt ?? Date.now() - index,
    })),
  };
}

describe('PatternRenderer', () => {
  it('uses an Agent summarizer instead of regex-rendering raw tool logs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patterns-renderer-'));
    const archival = makeArchival([
      {
        tags: ['pattern', 'positive', 'execute_command'],
        text: [
          '[POSITIVE] 场景: 帮我查最近 3 个月的应用构建数量统计，并用柱状图绘制',
          '路径: execute_command',
          '关键发现: {"success":true,"exitCode":0,"command":"export NVM_DIR=\\"$HOME/.nvm\\" && [ -s "',
        ].join('\n'),
      },
      {
        tags: ['pattern', 'negative', 'execute_command'],
        text: [
          '[NEGATIVE] 场景: 查询数据库列表',
          '路径: query db databases',
          '失败原因: {"success":false,"exitCode":1,"message":"empty result"}',
          '教训: 避免在类似场景使用该路径',
        ].join('\n'),
      },
    ]);

    const summarizer = vi.fn(async (input) => {
      expect(input.positives[0]?.text).toContain('{"success":true');
      return [
        '## 最佳实践',
        '1. 数据查询前先校验运行环境',
        '   - 适用场景：需要调用数据平台 CLI 完成查询或制图。',
        '   - 推荐做法：先确认 Node、registry、登录态和 CLI wrapper，再执行查询。',
        '   - 关键约束：不要把工具返回 JSON 当作经验正文。',
        '',
        '## 反模式',
        '- 直接复述工具日志：会产生截断 JSON 和不可读经验；应交给 Agent 总结成原则。',
      ].join('\n');
    });

    await new PatternRenderer(dir, archival as any, summarizer).regenerate();

    const content = fs.readFileSync(path.join(dir, 'Patterns.md'), 'utf-8');
    expect(summarizer).toHaveBeenCalledTimes(1);
    expect(content).toContain('## 最佳实践');
    expect(content).toContain('数据查询前先校验运行环境');
    expect(content).toContain('## 反模式');
    expect(content).toContain('直接复述工具日志');
    expect(content).not.toContain('[POSITIVE]');
    expect(content).not.toContain('{"success":true');
    expect(content).not.toContain('关键发现:');
  });
});
