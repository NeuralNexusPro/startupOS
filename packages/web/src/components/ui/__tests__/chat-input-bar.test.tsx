import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatInputBar } from '../chat-input-bar';

describe('ChatInputBar', () => {
  it('keeps upload button clickable when message input is disabled', () => {
    const onUpload = vi.fn();

    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        disabled
        isGenerating
        onUpload={onUpload}
      />,
    );

    fireEvent.click(screen.getByTitle('上传文件'));

    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('disables upload button while upload is in progress', () => {
    const onUpload = vi.fn();

    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        onUpload={onUpload}
        uploading
      />,
    );

    fireEvent.click(screen.getByTitle('上传文件'));

    expect(onUpload).not.toHaveBeenCalled();
  });

  it('renders the optional task action with an accessible tooltip', () => {
    const onCreateTask = vi.fn();

    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        onCreateTask={onCreateTask}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));

    expect(onCreateTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('创建任务');
  });

  it('does not render task action for callers that do not provide it', () => {
    render(<ChatInputBar onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '创建任务' })).not.toBeInTheDocument();
  });

  it('keeps task creation disabled while the conversation input is locked', () => {
    const onCreateTask = vi.fn();
    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        onCreateTask={onCreateTask}
        disabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));
    expect(onCreateTask).not.toHaveBeenCalled();
  });
});
