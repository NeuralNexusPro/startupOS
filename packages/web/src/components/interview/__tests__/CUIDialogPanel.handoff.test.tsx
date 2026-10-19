import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CUIDialogPanel } from '../CUIDialogPanel';

vi.mock('@/components/ui/chat', () => ({
  ChatMessageList: () => <div data-testid="message-list">访谈消息</div>,
}));
vi.mock('@/components/ui/chat-input-bar', () => ({
  ChatInputBar: () => <div data-testid="chat-input">输入区</div>,
}));
vi.mock('@/lib/hooks/use-file-upload', () => ({
  useFileUpload: () => vi.fn(),
}));

function renderPanel(options?: {
  interviewComplete?: boolean;
  onOpenSolutionDesign?: () => void;
}) {
  return render(
    <CUIDialogPanel
      sessionId="session-test"
      messages={[]}
      isLoading={false}
      onSendMessage={vi.fn()}
      interviewComplete={options?.interviewComplete}
      onOpenSolutionDesign={options?.onOpenSolutionDesign}
    />
  );
}

describe('CUIDialogPanel solution handoff', () => {
  it('does not render a handoff for an incomplete interview', () => {
    renderPanel({ interviewComplete: false, onOpenSolutionDesign: vi.fn() });
    expect(screen.queryByRole('region', { name: '访谈已完成' })).not.toBeInTheDocument();
  });

  it('renders the completion card at the conversation tail', () => {
    renderPanel({ interviewComplete: true, onOpenSolutionDesign: vi.fn() });

    const list = screen.getByTestId('message-list');
    const card = screen.getByRole('region', { name: '访谈已完成' });
    const input = screen.getByTestId('chat-input');
    expect(list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('continues to solution design through the supplied window action', () => {
    const onOpenSolutionDesign = vi.fn();
    renderPanel({ interviewComplete: true, onOpenSolutionDesign });

    fireEvent.click(screen.getByRole('button', { name: '进入解决方案设计' }));
    expect(onOpenSolutionDesign).toHaveBeenCalledTimes(1);
  });
});
