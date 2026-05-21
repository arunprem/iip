import {
  LayoutDashboard,
  Radio,
  FolderOpen,
  Bot,
  MapPin,
  Network,
  UserCheck,
  Shield,
  BarChart3,
  Settings,
  KeyRound,
  Menu,
  type LucideIcon,
} from 'lucide-react';

export type NavLinkConfig = {
  type: 'link';
  to: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  menuKey?: string;
};

export type NavGroupConfig = {
  type: 'group';
  label: string;
  icon: LucideIcon;
  menuKey?: string;
  children: Omit<NavLinkConfig, 'type'>[];
};

export type MenuEntryConfig = NavLinkConfig | NavGroupConfig;

export const MAIN_MENU_ENTRIES: MenuEntryConfig[] = [
  {
    type: 'link',
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['SYSTEM_ADMIN', 'SUPERVISOR', 'WATCH_OFFICER', 'ANALYST', 'IT_ADMIN'],
    menuKey: 'dashboard',
  },
  {
    type: 'link',
    to: '/watch-console',
    label: 'Watch Console',
    icon: Radio,
    roles: ['WATCH_OFFICER', 'SUPERVISOR', 'SYSTEM_ADMIN'],
    menuKey: 'watch-console',
  },
  {
    type: 'link',
    to: '/cases',
    label: 'Intelligence Cases',
    icon: FolderOpen,
    roles: ['ANALYST', 'SUPERVISOR', 'SYSTEM_ADMIN'],
    menuKey: 'cases',
  },
  {
    type: 'group',
    label: 'Analytics',
    icon: BarChart3,
    menuKey: 'analytics',
    children: [
      {
        to: '/analyst-workbench',
        label: 'Analyst Workbench',
        icon: Bot,
        roles: ['ANALYST', 'SUPERVISOR'],
        menuKey: 'analyst-workbench',
      },
      {
        to: '/hotspot-console',
        label: 'Hotspot Console',
        icon: MapPin,
        roles: ['ANALYST', 'SUPERVISOR', 'WATCH_OFFICER'],
        menuKey: 'hotspot-console',
      },
      {
        to: '/kg-canvas',
        label: 'Knowledge Graph',
        icon: Network,
        roles: ['ANALYST', 'SUPERVISOR'],
        menuKey: 'kg-canvas',
      },
    ],
  },
  {
    type: 'link',
    to: '/humint-vault',
    label: 'HUMINT Vault',
    icon: UserCheck,
    roles: ['ANALYST', 'SUPERVISOR'],
    menuKey: 'humint-vault',
  },
];

export const SYSTEM_MANAGEMENT_GROUP: NavGroupConfig = {
  type: 'group',
  label: 'System Management',
  icon: Settings,
  menuKey: 'system-management',
  children: [
    {
      to: '/system/roles',
      label: 'Role Management',
      icon: Shield,
      roles: ['SYSTEM_ADMIN', 'IT_ADMIN'],
      menuKey: 'role-management',
    },
    {
      to: '/system/privileges',
      label: 'Privilege Management',
      icon: KeyRound,
      roles: ['SYSTEM_ADMIN', 'IT_ADMIN'],
      menuKey: 'privilege-management',
    },
    {
      to: '/system/menus',
      label: 'Menu Management',
      icon: Menu,
      roles: ['SYSTEM_ADMIN', 'IT_ADMIN'],
      menuKey: 'menu-management',
    },
  ],
};

export const SUPPORT_MENU_ENTRIES: MenuEntryConfig[] = [SYSTEM_MANAGEMENT_GROUP];

export const SUPER_ADMIN_ROLES = ['SYSTEM_ADMIN', 'IT_ADMIN'];
