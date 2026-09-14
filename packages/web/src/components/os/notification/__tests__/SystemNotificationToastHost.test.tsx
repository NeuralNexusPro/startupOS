import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SystemNotificationToastHost } from '../SystemNotificationToastHost';

function emit(detail: { title: string; body: string; activationTarget?: { entryType: 'skill'; entryId: string } }): void {
  act(() => { window.dispatchEvent(new CustomEvent('originos:system-notification', { detail })); });
}

describe('SystemNotificationToastHost details and actions', () => {
  it('expands a non-actionable toast to show its full details', () => {
    render(<SystemNotificationToastHost />);
    emit({ title: '需要人工查看的完整标题', body: '第一段完整内容\n第二段完整内容' });
    const toast = screen.getByRole('button', { name: /查看详情：需要人工查看的完整标题/ });
    expect(toast).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toast);

    expect(toast).toHaveAttribute('aria-expanded', 'true');
    expect(toast).toHaveTextContent(/第一段完整内容\s+第二段完整内容/);
    expect(toast.querySelector('.whitespace-pre-wrap')).not.toHaveClass('line-clamp-3');
  });

  it('executes an actionable toast directly', () => {
    const onActivate = vi.fn();
    render(<SystemNotificationToastHost onActivate={onActivate} />);
    emit({ title: '处理邮件', body: '请处理', activationTarget: { entryType: 'skill', entryId: 'mail-triage' } });

    fireEvent.click(screen.getByRole('button', { name: /立即处理：处理邮件/ }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith({ entryType: 'skill', entryId: 'mail-triage' });
    expect(screen.queryByText('处理邮件')).not.toBeInTheDocument();
  });
});
