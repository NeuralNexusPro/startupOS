import { describe, expect, it } from 'vitest';

import { deriveTaskTitle } from '../task-title';

describe('deriveTaskTitle', () => {
  it('uses the Supervisor supplied title when present', () => {
    expect(deriveTaskTitle('一大段执行描述', '请假申请受理')).toBe('请假申请受理');
  });

  it('extracts a concise title for historical description-only tasks', () => {
    expect(deriveTaskTitle('整理项目中“报销审批”的完整规则，输出一份结构化草稿。后续还有更多要求。'))
      .toBe('整理项目中“报销审批”的完整规则');
  });

  it('limits long titles and handles empty input', () => {
    expect(deriveTaskTitle('请阅读项目草稿文件并提炼你负责的考勤与请假域全部业务规则和状态流转')).toHaveLength(20);
    expect(deriveTaskTitle('')).toBe('未命名任务');
  });
});
