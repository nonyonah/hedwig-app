import {
  Buildings,
  CalendarDots,
  Cards,
  ChartBar,
  CheckCircle,
  CreditCard,
  CurrencyDollar,
  Faders,
  House,
  User,
  UsersThree,
  Wallet,
  ArrowsLeftRight,
  FileText,
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
  /** Sub-items shown as indented children when the parent is expanded. */
  subItems?: { title: string; href: string }[];
}

export const navigationGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: House, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Calendar', href: '/calendar', icon: CalendarDots, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
    ]
  },
  {
    label: 'Workspace',
    items: [
      // Clients + Projects hidden (pages kept at /clients + /projects for a future return).
      { title: 'Agents', href: '/agents', icon: UsersThree, count: null, muted: false, roles: ['owner', 'admin'] },
      { title: 'Approvals', href: '/approvals', icon: CheckCircle, count: null, muted: false, roles: ['owner', 'admin'] },
      { title: 'Team', href: '/workspace/members', icon: User, count: null, muted: false, roles: ['owner', 'admin'], workspaceTypes: ['organization'] },
      { title: 'Contracts', href: '/contracts', icon: CreditCard, count: null, muted: false, roles: ['owner', 'admin'] },
    ]
  },
  {
    label: 'Money',
    items: [
      {
        title: 'Insights', href: '/insights', icon: ChartBar, count: null, muted: false, roles: ['owner', 'admin'],
      },
      { title: 'Payroll', href: '/workspace/payroll', icon: CurrencyDollar, count: null, muted: false, roles: ['owner', 'admin'], workspaceTypes: ['organization'] },
      { title: 'Payments', href: '/payments', icon: Cards, count: null, muted: false, roles: ['owner', 'admin', 'member'] },
      { title: 'Accounts', href: '/accounts', icon: Wallet, count: null, muted: false, roles: ['owner', 'admin', 'member'], workspaceTypes: ['personal'] },
      { title: 'Cards', href: '/cards', icon: CreditCard, count: null, muted: false, roles: ['owner', 'admin'] },
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
