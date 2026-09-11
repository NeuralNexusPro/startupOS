import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ToolExecutionFrame from '../chat/ToolExecutionFrame';

describe('ToolExecutionFrame', () => {
  it('preserves tool names, status icons and running hints after moving to shared UI', () => {
    const { container, rerender } = render(
      <ToolExecutionFrame executions={[
        { id: 'running', name: 'read_file', status: 'running', timestamp: 1 },
        { id: 'completed', name: 'write_file', status: 'completed', timestamp: 2 },
        { id: 'error', name: 'custom_tool', status: 'error', timestamp: 3 },
      ]} />,
    );

    expect(screen.getByText('读取文件').parentElement?.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.getByText('写入文件').parentElement?.querySelector('.text-teal-500')).not.toBeNull();
    expect(screen.getByText('custom_tool').parentElement?.querySelector('.text-red-500')).not.toBeNull();
    expect(screen.getAllByText('执行中...')).toHaveLength(1);

    rerender(<ToolExecutionFrame executions={[
      { id: 'running', name: 'read_file', status: 'completed', timestamp: 1 },
    ]} />);
    expect(screen.queryByText('执行中...')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelector('.text-teal-500')).not.toBeNull();

    rerender(<ToolExecutionFrame executions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
