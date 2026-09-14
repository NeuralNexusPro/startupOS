import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentTaskCard } from '../AgentTaskCard';
import { AgentTaskDraftCard } from '../AgentTaskDraftCard';
import { shouldShowAgentTaskPanel } from '../agent-task-panel-visibility';
import { supportsAgentTaskRuntime } from '../use-agent-task-runtime';

import type { AgentTaskRuntimeSnapshotV1 } from '@originos/core/lib/integrations/pi-agent/task-runtime';

function createSnapshot(
  overrides: Partial<AgentTaskRuntimeSnapshotV1['execution']> = {},
): AgentTaskRuntimeSnapshotV1 {
  return {
    version: 1,
    sessionId: 'session-1',
    execution: {
      schemaVersion: 1,
      mode: 'task_running',
      status: 'running',
      requestId: 'request-1',
      taskId: 'task-1',
      bridgeEpoch: 4,
      expectedRevision: 8,
      expectedCursor: 'cursor-8',
      continuationCount: 1,
      noProgressCount: 0,
      updatedAt: '2026-08-02T00:00:00.000Z',
      ...overrides,
    },
    projection: {
      version: 1,
      taskId: 'task-1',
      title: '交付评估报告',
      objective: '读取材料并生成可验证的完整报告',
      status: 'active',
      progress: 45,
      currentStep: '读取输入材料',
      nextAction: '生成报告',
      steps: [{
        id: 'step-1',
        text: '读取输入材料',
        expectedOutput: '结构化材料摘要',
        status: 'active',
        evidenceRequired: true,
        evidenceCount: 1,
      }],
      criteria: [{
        id: 'criterion-1',
        text: '报告文件存在且内容完整',
        status: 'pending',
        evidenceCount: 0,
        note: '等待生成文件证据',
      }],
      blockers: [{
        id: 'blocker-1',
        reason: '缺少岗位模型',
        blockedBy: 'user',
        neededToUnblock: '上传岗位模型',
        resolved: false,
      }],
      warnings: ['自动续跑次数接近上限'],
      evidenceCount: 1,
      actions: ['stop', 'cancel'],
      revision: 8,
      cursor: 'cursor-8',
      stateHash: 'hash-8',
      truncated: true,
    },
  };
}

describe('Agent task runtime UI', () => {
  it('keeps a cancelled draft renderer-local without submitting it', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AgentTaskDraftCard
        draft={{
          requestId: 'request-1',
          title: '交付报告',
          objective: '生成交付报告',
          acceptanceCriteria: ['报告可读取'],
        }}
        onChange={vi.fn()}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消任务草稿' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid draft and supports adding or removing criteria', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const draft = {
      requestId: 'request-1',
      title: '交付报告',
      objective: '生成交付报告',
      acceptanceCriteria: ['报告可读取'],
    };

    render(
      <AgentTaskDraftCard
        draft={draft}
        onChange={onChange}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      acceptanceCriteria: ['报告可读取', ''],
    });

    fireEvent.click(screen.getByRole('button', { name: '删除验收标准 1' }));
    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      acceptanceCriteria: [''],
    });

    fireEvent.click(screen.getByRole('button', { name: '提交任务' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('exposes the long-running entry for assistant, agents, role agents and skills', () => {
    expect(supportsAgentTaskRuntime('assistant')).toBe(true);
    expect(supportsAgentTaskRuntime('agent')).toBe(true);
    expect(supportsAgentTaskRuntime('role-agent')).toBe(true);
    expect(supportsAgentTaskRuntime('skill')).toBe(true);
    expect(supportsAgentTaskRuntime('project')).toBe(false);
  });

  it('renders bounded progress, evidence, blockers, warnings and distinct stop/cancel controls', () => {
    const onControl = vi.fn();
    const { container } = render(
      <AgentTaskCard
        snapshot={createSnapshot()}
        onControl={onControl}
      />,
    );

    expect(screen.getByText('交付评估报告')).toBeInTheDocument();
    expect(screen.getAllByText('读取输入材料').length).toBeGreaterThan(0);
    expect(screen.getByText('报告文件存在且内容完整')).toBeInTheDocument();
    expect(screen.getByText(/阻塞：缺少岗位模型/)).toBeInTheDocument();
    expect(screen.getByText(/警告：自动续跑次数接近上限/)).toBeInTheDocument();
    expect(screen.getByText('部分内容已按显示上限省略。')).toBeInTheDocument();
    expect(container.querySelector('section[aria-label="当前任务"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '停止续跑' }));
    expect(onControl).toHaveBeenCalledWith('stop');
    fireEvent.click(screen.getByRole('button', { name: '取消任务' }));
    expect(onControl).toHaveBeenCalledWith('cancel');
  });

  it('exposes resume and retry actions for recoverable states', () => {
    const onControl = vi.fn();
    const paused = createSnapshot({ status: 'paused' });
    paused.projection = { ...paused.projection!, actions: ['resume'] };
    const { rerender } = render(<AgentTaskCard snapshot={paused} onControl={onControl} />);

    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    expect(onControl).toHaveBeenCalledWith('resume');

    const failed = createSnapshot({
      mode: 'chat',
      status: 'failed',
      draft: { objective: '生成交付报告', acceptanceCriteria: ['报告可读取'] },
      lastError: { code: 'PLAN_FAILED', message: '规划失败', retryable: true },
    });
    failed.projection = undefined;
    rerender(<AgentTaskCard snapshot={failed} onControl={onControl} />);

    expect(screen.getByRole('alert')).toHaveTextContent('规划失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onControl).toHaveBeenCalledWith('retry');
  });

  it('shows blocker reply context while waiting for the existing message input', () => {
    const waiting = createSnapshot({ status: 'waiting_user' });
    waiting.projection = { ...waiting.projection!, status: 'blocked', actions: ['cancel'] };

    render(<AgentTaskCard snapshot={waiting} onControl={vi.fn()} />);

    expect(screen.getByText(/请在下方消息输入框回复阻塞问题/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '恢复' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消任务' })).toBeInTheDocument();
  });

  it('hides the task panel after terminal completion even when projection remains cached', () => {
    const completed = createSnapshot({
      mode: 'chat',
      status: 'completed',
      draft: { objective: '生成交付报告', acceptanceCriteria: ['报告可读取'] },
    });
    completed.projection = {
      ...completed.projection!,
      status: 'done',
      progress: 100,
      actions: [],
    };

    expect(shouldShowAgentTaskPanel(completed, false)).toBe(false);
    expect(shouldShowAgentTaskPanel(createSnapshot({ status: 'running' }), true)).toBe(true);
    expect(shouldShowAgentTaskPanel(createSnapshot({ status: 'failed', mode: 'chat' }), true)).toBe(true);
  });

  it('allows title/objective submission without acceptance criteria and captures optional context', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(
      <AgentTaskDraftCard
        draft={{
          requestId: 'request-2',
          title: '调研报告',
          objective: '完成行业调研',
          context: '优先覆盖公开资料',
          acceptanceCriteria: [''],
        }}
        onChange={onChange}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('补充上下文（可选）'), {
      target: { value: '仅使用一手资料' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ context: '仅使用一手资料' }));

    fireEvent.click(screen.getByRole('button', { name: '提交任务' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('requires title and objective before draft submission', () => {
    render(
      <AgentTaskDraftCard
        draft={{
          requestId: 'request-3',
          title: '',
          objective: '完成行业调研',
          acceptanceCriteria: [],
        }}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '提交任务' })).toBeDisabled();
  });

  it('labels canonical cancellation separately from a paused stop', () => {
    const cancelled = createSnapshot({ mode: 'chat', status: 'cancelled' });
    cancelled.projection = { ...cancelled.projection!, status: 'cancelled', actions: ['return_to_chat'] };

    render(<AgentTaskCard snapshot={cancelled} onControl={vi.fn()} />);

    expect(screen.getByText('已取消')).toBeInTheDocument();
    expect(screen.queryByText('已暂停')).not.toBeInTheDocument();
  });
});
