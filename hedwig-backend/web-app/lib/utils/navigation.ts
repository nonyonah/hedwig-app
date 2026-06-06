import {
  Buildings,
  CalendarDots,
  Cards,
  ChartBar,
  ClockCountdown,
  CreditCard,
  Faders,
  FolderSimple,
  House,
  Sparkle,
  UsersThree,
  Wallet,
} from '@/components/ui/lucide-icons';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<any>;
  count: null;
  muted: boolean;
  roles: WorkspaceRole[];
}

export const navigationGroups = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: House, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Insights', href: '/insights', icon: Sparkle, count: null, muted: false, roles: ['owner', 'admin'] },
      { title: 'Calendar', href: '/calendar', icon: CalendarDots, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
    ]
  },
  {
    label: 'Workspace',
    items: [
      { title: 'Clients', href: '/clients', icon: UsersThree, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Projects', href: '/projects', icon: FolderSimple, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Time', href: '/time', icon: ClockCountdown, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Contracts', href: '/contracts', icon: CreditCard, count: null, muted: false, roles: ['owner', 'admin'] },
    ]
  },
  {
    label: 'Money',
    items: [
      { title: 'Revenue', href: '/revenue', icon: ChartBar, count: null, muted: false, roles: ['owner', 'admin'] },
      { title: 'Payments', href: '/payments', icon: Cards, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Wallet', href: '/wallet', icon: Wallet, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
    ]
  },
  {
    label: 'System',
    items: [
      { title: 'Workspace', href: '/workspace/settings', icon: Buildings, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Settings', href: '/settings', icon: Faders, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
    ]
  }
];
