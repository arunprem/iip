import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck, ShieldCheck } from 'lucide-react';
import { AdminButton } from '../components/admin/AdminButton';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import {
  formatNotificationTimestamp,
  useNotificationStore,
  type AppNotification,
  type NotificationKind,
} from '../stores/notificationStore';

const typeStyles: Record<NotificationKind, string> = {
  alert: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-iip-primary/20 dark:text-iip-primary',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
};

const typeLabels: Record<NotificationKind, string> = {
  alert: 'Alert',
  info: 'Information',
  success: 'Success',
};

function NotificationDetailActions({ notification }: { notification: AppNotification }) {
  if (notification.eventType === 'system.security.mfa_policy') {
    return (
      <div className="flex flex-wrap gap-3 pt-2">
        <Link to="/profile" className="btn btn-primary btn-sm">
          Open My Profile
        </Link>
        {Boolean(notification.metadata?.force_mfa) && (
          <p className="text-xs text-iip-text-muted w-full">
            Set up two-factor authentication from your profile before your next session ends.
          </p>
        )}
      </div>
    );
  }
  return null;
}

function NotificationDetail({ notification }: { notification: AppNotification }) {
  const navigate = useNavigate();
  const markRead = useNotificationStore((s) => s.markRead);

  return (
    <div className="max-w-3xl">
      <button
        type="button"
        onClick={() => navigate('/notifications')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-iip-text-muted hover:text-iip-primary mb-4"
      >
        <ArrowLeft size={16} aria-hidden />
        All notifications
      </button>

      <article className="dashboard-card overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-iip-border bg-gradient-to-r from-iip-primary/[0.04] to-transparent">
          <div className="flex flex-wrap items-start gap-4">
            <div className="p-3 rounded-xl bg-iip-primary/10 text-iip-primary shrink-0">
              <ShieldCheck size={24} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${typeStyles[notification.type]}`}
                >
                  {typeLabels[notification.type]}
                </span>
                {notification.unread && (
                  <span className="rounded-full bg-iip-primary/15 px-2 py-0.5 text-[10px] font-semibold text-iip-primary">
                    Unread
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-iip-text">{notification.title}</h2>
              <p className="text-sm text-iip-text-muted mt-1">
                {formatNotificationTimestamp(notification.createdAt)}
                <span className="mx-2 text-iip-border">·</span>
                {notification.time}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-iip-text-muted mb-2">
              Message
            </h3>
            <p className="text-base text-iip-text leading-relaxed whitespace-pre-wrap">
              {notification.message}
            </p>
          </div>

          {notification.metadata?.changed_by && (
            <div className="text-sm text-iip-text-muted border-t border-iip-border pt-4">
              Policy updated by{' '}
              <span className="font-medium text-iip-text">
                {String(notification.metadata.changed_by)}
              </span>
            </div>
          )}

          <NotificationDetailActions notification={notification} />

          {!notification.unread && (
            <p className="text-xs text-iip-text-muted flex items-center gap-1.5">
              <CheckCheck size={14} aria-hidden />
              Marked as read
            </p>
          )}
        </div>

        {notification.unread && (
          <div className="px-6 sm:px-8 py-4 border-t border-iip-border bg-iip-bg/40 flex justify-end">
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => void markRead(notification.id)}
            >
              <CheckCheck size={15} aria-hidden />
              Mark as read
            </AdminButton>
          </div>
        )}
      </article>
    </div>
  );
}

function NotificationList() {
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const openNotification = (id: string) => {
    void useNotificationStore.getState().markRead(id);
    navigate(`/notifications/${id}`);
  };

  return (
    <div className="max-w-3xl">
      <section className="dashboard-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-iip-border">
          <div>
            <p className="text-sm font-semibold text-iip-text">Inbox</p>
            <p className="text-xs text-iip-text-muted">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <AdminButton variant="ghost" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck size={15} aria-hidden />
              Mark all read
            </AdminButton>
          )}
        </div>

        <ul className="divide-y divide-iip-border">
          {notifications.length === 0 ? (
            <li className="px-5 py-12 text-center text-sm text-iip-text-muted">
              No notifications yet. System alerts will appear here in real time.
            </li>
          ) : (
            notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openNotification(item.id)}
                  className={`w-full text-left px-5 py-4 hover:bg-iip-surface-hover transition-colors ${
                    item.unread ? 'bg-iip-primary/[0.03]' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        item.unread ? 'bg-iip-primary' : 'bg-iip-border'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-iip-text">{item.title}</p>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${typeStyles[item.type]}`}
                        >
                          {item.type}
                        </span>
                      </div>
                      <p className="text-sm text-iip-text-muted mt-1 line-clamp-2">{item.message}</p>
                      <p className="text-[11px] text-iip-text-muted/80 mt-1.5">{item.time}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

export default function Notifications() {
  const { id } = useParams<{ id: string }>();
  const notifications = useNotificationStore((s) => s.items);
  const fetchHistory = useNotificationStore((s) => s.fetchHistory);
  const loadNotification = useNotificationStore((s) => s.loadNotification);
  const markRead = useNotificationStore((s) => s.markRead);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const selected = id ? notifications.find((n) => n.id === id) : undefined;

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!id || selected) return;
    setLoadingDetail(true);
    void loadNotification(id).finally(() => setLoadingDetail(false));
  }, [id, selected, loadNotification]);

  useEffect(() => {
    if (selected?.unread) void markRead(selected.id);
  }, [selected, markRead]);

  const resolved = id ? notifications.find((n) => n.id === id) : undefined;

  return (
    <AdminPageLayout
      title={resolved ? 'Notification' : 'Notifications'}
      description={
        resolved
          ? 'Read the full message and any related actions.'
          : 'System alerts and policy updates delivered to your account in real time.'
      }
      icon={Bell}
    >
      {id && loadingDetail ? (
        <div className="dashboard-card max-w-lg p-8 text-center text-sm text-iip-text-muted">
          Loading notification…
        </div>
      ) : id && !resolved ? (
        <div className="dashboard-card max-w-lg p-8 text-center">
          <p className="text-sm text-iip-text-muted mb-4">
            This notification could not be found. It may have been removed or you may not have
            access to it.
          </p>
          <Link to="/notifications" className="btn btn-primary btn-sm">
            Back to notifications
          </Link>
        </div>
      ) : resolved ? (
        <NotificationDetail notification={resolved} />
      ) : (
        <NotificationList />
      )}
    </AdminPageLayout>
  );
}
