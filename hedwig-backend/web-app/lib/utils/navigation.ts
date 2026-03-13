import { CalendarDays, CircleDollarSign, CreditCard, FolderKanban, Landmark, LayoutDashboard, ReceiptText, Settings2, Users, WalletCards } from 'lucide-react';

export const navigation = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/clients', icon: Users },
  { title: 'Projects', href: '/projects', icon: FolderKanban },
  { title: 'Payments', href: '/payments', icon: ReceiptText },
  { title: 'Contracts', href: '/contracts', icon: CreditCard },
  { title: 'Wallet', href: '/wallet', icon: WalletCards },
  { title: 'Accounts', href: '/accounts', icon: Landmark },
  { title: 'Offramp', href: '/offramp', icon: CircleDollarSign },
  { title: 'Calendar', href: '/calendar', icon: CalendarDays },
  { title: 'Settings', href: '/settings', icon: Settings2 }
] as const;
