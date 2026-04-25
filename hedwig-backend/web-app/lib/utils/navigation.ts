import {
  CalendarDots,
  Cards,
  ChartBar,
  CurrencyDollar,
  CreditCard,
  Faders,
  FolderSimple,
  House,
  Sparkle,
  UsersThree,
} from '@/components/ui/lucide-icons';

export const navigationGroups = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: House, count: null, muted: false },
      { title: 'Insights', href: '/insights', icon: Sparkle, count: null, muted: false },
      { title: 'Calendar', href: '/calendar', icon: CalendarDots, count: null, muted: false }
    ]
  },
  {
    label: 'Workspace',
    items: [
      { title: 'Clients', href: '/clients', icon: UsersThree, count: null, muted: false },
      { title: 'Projects', href: '/projects', icon: FolderSimple, count: null, muted: false },
      { title: 'Contracts', href: '/contracts', icon: CreditCard, count: null, muted: false },
    ]
  },
  {
    label: 'Money',
    items: [
      { title: 'Revenue', href: '/revenue', icon: ChartBar, count: null, muted: false },
      { title: 'Payments', href: '/payments', icon: Cards, count: null, muted: false }
    ]
  },
  {
    label: 'System',
    items: [
      { title: 'Pricing', href: '/pricing', icon: CurrencyDollar, count: null, muted: false },
      { title: 'Settings', href: '/settings', icon: Faders, count: null, muted: false }
    ]
  }
] as const;
