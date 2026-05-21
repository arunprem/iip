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
  Circle,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
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
  Circle,
};

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? Circle;
}
