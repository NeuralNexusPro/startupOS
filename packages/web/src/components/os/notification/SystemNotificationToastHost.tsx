'use client';

import * as React from 'react';
import { Bell, X } from 'lucide-react';

interface SystemNotificationToast {
  id: string;
  title: string;
  body?: string;
  delivery?: string;
  activationTarget?: SystemNotificationActivationTarget;
}

export interface SystemNotificationActivationTarget {
  entryType: 'project' | 'agent' | 'role-agent' | 'skill';
  entryId: string;
  title?: string;
  initialMessage?: string;
}

interface SystemNotificationEventDetail {
  title: string;
  body?: string;
  activationTarget?: SystemNotificationActivationTarget;
  result?: {
    delivery?: string;
  };
}

export function SystemNotificationToastHost({
  onActivate,
}: {
  onActivate?: (target: SystemNotificationActivationTarget) => void;
}) {
  const [toasts, setToasts] = React.useState<SystemNotificationToast[]>([]);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    function handleNotification(event: Event) {
      const detail = (event as CustomEvent<SystemNotificationEventDetail>).detail;
      if (!detail?.title) return;
      const id = `system-notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((current) => [
        {
          id,
          title: detail.title,
          body: detail.body,
          activationTarget: detail.activationTarget,
          delivery: detail.result?.delivery,
        },
        ...current.slice(0, 2),
      ]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 12000);
    }

    window.addEventListener('originos:system-notification', handleNotification);
    return () => window.removeEventListener('originos:system-notification', handleNotification);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-12 z-[10001] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="button"
          tabIndex={0}
          aria-label={`${toast.activationTarget ? '立即处理' : expandedIds.has(toast.id) ? '收起详情' : '查看详情'}：${toast.title}`}
          aria-expanded={toast.activationTarget ? undefined : expandedIds.has(toast.id)}
          onClick={() => {
            if (toast.activationTarget) {
              onActivate?.(toast.activationTarget);
              setToasts((current) => current.filter((item) => item.id !== toast.id));
              return;
            }
            setExpandedIds((current) => {
              const next = new Set(current);
              if (next.has(toast.id)) next.delete(toast.id); else next.add(toast.id);
              return next;
            });
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.currentTarget.click();
          }}
          className="pointer-events-auto cursor-pointer rounded-lg border border-white/12 bg-neutral-950 px-3 py-3 text-white shadow-2xl transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
              <Bell className="h-4 w-4 text-sky-100" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={`${expandedIds.has(toast.id) ? 'whitespace-normal break-words' : 'truncate'} text-sm font-semibold text-white`}>{toast.title}</p>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setToasts((current) => current.filter((item) => item.id !== toast.id));
                  }}
                  className="shrink-0 text-white/45 transition-colors hover:text-white"
                  aria-label="关闭通知"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {toast.body ? (
                <p className={`mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-white/65 ${expandedIds.has(toast.id) ? '' : 'line-clamp-3'}`}>{toast.body}</p>
              ) : null}
              <p className={`mt-2 text-[10px] font-medium ${toast.activationTarget ? 'text-blue-300' : 'text-white/40'}`}>{toast.activationTarget ? '点击立即处理 ↗' : expandedIds.has(toast.id) ? '点击收起详情' : '点击查看详情'}</p>
              {toast.delivery ? (
                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/35">{toast.delivery}</p>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
