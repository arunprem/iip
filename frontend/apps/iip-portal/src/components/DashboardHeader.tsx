import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  User,
  CheckCheck,
} from 'lucide-react';
import type { UserContext } from './AppShell';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { OfficeSelector } from './OfficeSelector';

interface DashboardHeaderProps {
  user: UserContext;
  onMenuClick?: () => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: 'alert' | 'info' | 'success';
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    title: 'Critical alert escalated',
    message: 'Cross-border alert chain requires supervisor review.',
    time: '2 min ago',
    unread: true,
    type: 'alert',
  },
  {
    id: '2',
    title: 'New case assigned',
    message: 'Operation Coastal Watch has been assigned to your unit.',
    time: '45 min ago',
    unread: true,
    type: 'info',
  },
  {
    id: '3',
    title: 'Report approved',
    message: 'District Intel Brief #442 was signed off by command.',
    time: '3 hours ago',
    unread: true,
    type: 'success',
  },
  {
    id: '4',
    title: 'System maintenance',
    message: 'Scheduled maintenance window tonight 02:00–04:00 IST.',
    time: 'Yesterday',
    unread: false,
    type: 'info',
  },
];

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [ref, onClose, active]);
}

function dropdownPanelClass(open: boolean) {
  return `absolute right-0 top-[calc(100%+8px)] z-50 origin-top-right rounded-xl border border-iip-border bg-iip-surface shadow-lg transition-all duration-200 ease-out ${
    open
      ? 'pointer-events-auto scale-100 opacity-100 translate-y-0'
      : 'pointer-events-none scale-95 opacity-0 -translate-y-1'
  }`;
}

const typeStyles: Record<Notification['type'], string> = {
  alert: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  info: 'bg-blue-100 text-blue-600 dark:bg-iip-primary/20 dark:text-iip-primary',
  success: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
};

export function DashboardHeader({ user, onMenuClick }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.unread).length;

  useClickOutside(notifRef, () => setNotificationsOpen(false), notificationsOpen);
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen);

  const closeAll = () => {
    setNotificationsOpen(false);
    setProfileOpen(false);
  };

  const toggleNotifications = () => {
    setNotificationsOpen((prev) => !prev);
    setProfileOpen(false);
  };

  const toggleProfile = () => {
    setProfileOpen((prev) => !prev);
    setNotificationsOpen(false);
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleLogout = () => {
    closeAll();
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="relative z-40 h-16 shrink-0 bg-iip-surface border-b border-iip-border flex items-center justify-between gap-4 px-4 md:px-6">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        <div className="hidden sm:flex items-center flex-1 max-w-md">
          <div className="relative w-full">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted pointer-events-none"
            />
            <input
              type="search"
              placeholder="Search or type command..."
              className="w-full h-11 pl-10 pr-16 rounded-lg border border-iip-border bg-iip-bg text-sm text-iip-text placeholder:text-iip-text-muted focus:outline-none focus:ring-2 focus:ring-iip-primary/20 focus:border-iip-primary"
            />
            <kbd className="hidden md:inline absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-iip-text-muted bg-iip-surface border border-iip-border rounded px-1.5 py-0.5">
              ⌘ K
            </kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <OfficeSelector />
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 rounded-lg text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text border border-transparent"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={toggleNotifications}
            className={`relative p-2.5 rounded-lg transition-colors ${
              notificationsOpen
                ? 'bg-iip-primary/10 text-iip-primary'
                : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
            }`}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            aria-haspopup="true"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-iip-surface">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <div
            className={`${dropdownPanelClass(notificationsOpen)} w-[min(100vw-2rem,22rem)] sm:w-80`}
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-iip-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-iip-text">Notifications</p>
                <p className="text-xs text-iip-text-muted">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs font-medium text-iip-primary hover:text-iip-primary-hover"
                >
                  <CheckCheck size={14} />
                  Mark all read
                </button>
              )}
            </div>

            <ul className="max-h-80 overflow-y-auto py-1">
              {notifications.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-iip-text-muted">
                  No notifications
                </li>
              ) : (
                notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === item.id ? { ...n, unread: false } : n
                          )
                        )
                      }
                      className={`w-full text-left px-4 py-3 hover:bg-iip-surface-hover transition-colors ${
                        item.unread ? 'bg-iip-primary/5' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <span
                          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                            item.unread ? 'bg-iip-primary' : 'bg-transparent'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-iip-text">{item.title}</p>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${typeStyles[item.type]}`}
                            >
                              {item.type}
                            </span>
                          </div>
                          <p className="text-xs text-iip-text-muted mt-0.5 line-clamp-2">
                            {item.message}
                          </p>
                          <p className="text-[11px] text-iip-text-muted/80 mt-1">{item.time}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="border-t border-iip-border px-4 py-2.5">
              <button
                type="button"
                className="w-full text-center text-xs font-medium text-iip-primary hover:text-iip-primary-hover py-1"
              >
                View all notifications
              </button>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div ref={profileRef} className="relative pl-2 sm:pl-3 border-l border-iip-border">
          <button
            type="button"
            onClick={toggleProfile}
            className={`flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 transition-colors ${
              profileOpen
                ? 'bg-iip-surface-hover'
                : 'hover:bg-iip-surface-hover'
            }`}
            aria-expanded={profileOpen}
            aria-haspopup="true"
          >
            <div className="h-9 w-9 rounded-full bg-iip-primary/15 flex items-center justify-center text-iip-primary font-semibold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold text-iip-text leading-tight">{user.name}</p>
              <p className="text-xs text-iip-text-muted">{user.role}</p>
            </div>
            <ChevronDown
              size={16}
              className={`text-iip-text-muted hidden md:block transition-transform duration-200 ${
                profileOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div
            className={`${dropdownPanelClass(profileOpen)} w-56`}
            role="menu"
            aria-label="User menu"
          >
            <div className="border-b border-iip-border px-4 py-3">
              <p className="text-sm font-semibold text-iip-text">{user.name}</p>
              <p className="text-xs text-iip-text-muted">{user.username}</p>
              <span className="inline-flex mt-2 items-center gap-1 rounded-full bg-iip-primary/10 px-2 py-0.5 text-[10px] font-medium text-iip-primary">
                <Shield size={10} />
                {user.clearanceLevel}
              </span>
            </div>

            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-iip-text hover:bg-iip-surface-hover transition-colors"
                onClick={closeAll}
              >
                <User size={16} className="text-iip-text-muted" />
                My profile
              </button>
              {user.jitElevated && (
                <div className="mx-4 my-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  JIT session elevated
                </div>
              )}
            </div>

            <div className="border-t border-iip-border py-1">
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
