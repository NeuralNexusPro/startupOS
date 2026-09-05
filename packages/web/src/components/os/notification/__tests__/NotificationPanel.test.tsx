import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Notification } from '@/store/notificationStore';

const markNotificationRead = vi.fn(async () => undefined);
const dismissNotification = vi.fn(async () => undefined);
const markAllRead = vi.fn(async () => undefined);
const state: { notifications: Notification[] } = { notifications: [] };

vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: (selector: (value: unknown) => unknown) => selector({
    notifications: state.notifications,
    markNotificationRead,
    dismissNotification,
    markAllRead,
  }),
}));

const { default: NotificationPanel } = await import('../NotificationPanel');

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1', type: 'system_message', status: 'pending', title: '需要处理的完整通知标题',
    message: '这是一条很长的通知正文，展开以后必须能够完整查看，不能继续被右上角系统栏截断。',
    payload: {}, createdAt: Date.now(), updatedAt: Date.now(), ...overrides,
  };
}

describe('NotificationPanel details and actions', () => {
  beforeEach(() => { vi.clearAllMocks(); state.notifications = []; });

  it('expands full details for a notification without an action', async () => {
    state.notifications = [notification()];
    render(<NotificationPanel onClose={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /查看详情：需要处理的完整通知标题/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: '通知详情：需要处理的完整通知标题' })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: '通知详情：需要处理的完整通知标题' })).toHaveTextContent('这是一条很长的通知正文，展开以后必须能够完整查看，不能继续被右上角系统栏截断。');
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'));
  });

  it('executes an actionable notification directly without opening details', async () => {
    state.notifications = [notification({ payload: { activationTarget: { entryType: 'skill', entryId: 'mail-triage', title: '邮件处理' } } })];
    const onClose = vi.fn();
    const activated = vi.fn();
    window.addEventListener('originos:notification-activate', activated);
    render(<NotificationPanel onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /立即处理：需要处理的完整通知标题/ }));

    await waitFor(() => expect(activated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('region', { name: /通知详情/ })).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    window.removeEventListener('originos:notification-activate', activated);
  });

  it('dismisses without executing or expanding the notification', () => {
    state.notifications = [notification()];
    render(<NotificationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }));

    expect(dismissNotification).toHaveBeenCalledWith('notification-1');
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: /通知详情/ })).not.toBeInTheDocument();
  });
});
