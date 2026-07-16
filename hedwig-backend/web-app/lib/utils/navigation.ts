import {
  Buildings,
  CalendarDots,
  Cards,
  ChartBar,
  CreditCard,
  CurrencyDollar,
  Faders,
  FolderSimple,
  House,
  Sparkle,
  User,
  UsersThree,
  Wallet,
} from '@/components/ui/lucide-icons';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type WorkspaceType = 'personal' | 'organization';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<any>;
  count: null;
  muted: boolean;
  roles: WorkspaceRole[];
  /** Only show when active workspace matches one of these types. Omit to show always. */
  workspaceTypes?: WorkspaceType[];
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
      { title: 'Team', href: '/workspace/members', icon: User, count: null, muted: false, roles: ['owner', 'admin'], workspaceTypes: ['organization'] },
      { title: 'Contracts', href: '/contracts', icon: CreditCard, count: null, muted: false, roles: ['owner', 'admin'] },
    ]
  },
  {
    label: 'Money',
    items: [
      { title: 'Revenue', href: '/revenue', icon: ChartBar, count: null, muted: false, roles: ['owner', 'admin'] },
      { title: 'Payroll', href: '/workspace/payroll', icon: CurrencyDollar, count: null, muted: false, roles: ['owner', 'admin'], workspaceTypes: ['organization'] },
      { title: 'Payments', href: '/payments', icon: Cards, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Wallet', href: '/wallet', icon: Wallet, count: null, muted: false, roles: ['owner', 'admin', 'member'], workspaceTypes: ['personal'] },
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
