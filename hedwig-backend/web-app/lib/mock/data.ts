import type {
  AccountTransaction,
  Activity,
  Client,
  Contract,
  Invoice,
  InvoiceDraft,
  Milestone,
  Notification,
  OfframpTransaction,
  PaymentLink,
  PaymentLinkDraft,
  Project,
  Reminder,
  UsdAccount,
  User,
  WalletAccount,
  WalletAsset,
  WalletTransaction,
  Workspace,
  WorkspaceMember
} from '@/lib/models/entities';

export const workspace: Workspace = {
  id: 'ws_hedwig',
  name: 'Hedwig Studio',
  slug: 'hedwig-studio',
  plan: 'beta',
  timezone: 'Africa/Lagos'
};

export const currentUser: User = {
  id: 'user_hedwig',
  privyId: 'did:privy:web:hedwig-demo',
  workspaceId: workspace.id,
  email: 'nonyonah@gmail.com',
  firstName: 'Chinonso',
  lastName: 'Onah',
  role: 'owner'
};

export const workspaceMembers: WorkspaceMember[] = [
  { id: 'wm_1', workspaceId: workspace.id, userId: currentUser.id, role: 'owner' }
];

export const clients: Client[] = [
  {
    id: 'client_1',
    workspaceId: workspace.id,
    name: 'Aisha Bello',
    company: 'Northstar Labs',
    email: 'aisha@northstarlabs.co',
    status: 'active',
    totalBilledUsd: 18450,
    outstandingUsd: 2100,
    lastActivityAt: '2026-03-12T10:00:00.000Z'
  },
  {
    id: 'client_2',
    workspaceId: workspace.id,
    name: 'Marcus Reed',
    company: 'Atlas Commerce',
    email: 'marcus@atlascommerce.com',
    status: 'at_risk',
    totalBilledUsd: 9200,
    outstandingUsd: 3800,
    lastActivityAt: '2026-03-10T15:20:00.000Z'
  },
  {
    id: 'client_3',
    workspaceId: workspace.id,
    name: 'Zuri Capital',
    company: 'Zuri Capital',
    email: 'ops@zuricapital.com',
    status: 'active',
    totalBilledUsd: 32100,
    outstandingUsd: 0,
    lastActivityAt: '2026-03-11T08:40:00.000Z'
  }
];

export const projects: Project[] = [
  {
    id: 'project_1',
    clientId: 'client_1',
    workspaceId: workspace.id,
    name: 'Creator payout dashboard',
    status: 'active',
    budgetUsd: 12000,
    progress: 72,
    nextDeadlineAt: '2026-03-18T09:00:00.000Z',
    ownerName: 'Chinonso Onah'
  },
  {
    id: 'project_2',
    clientId: 'client_2',
    workspaceId: workspace.id,
    name: 'Treasury reporting portal',
    status: 'paused',
    budgetUsd: 6800,
    progress: 43,
    nextDeadlineAt: '2026-03-22T09:00:00.000Z',
    ownerName: 'Chinonso Onah'
  },
  {
    id: 'project_3',
    clientId: 'client_3',
    workspaceId: workspace.id,
    name: 'Stablecoin billing revamp',
    status: 'active',
    budgetUsd: 14500,
    progress: 88,
    nextDeadlineAt: '2026-03-15T13:00:00.000Z',
    ownerName: 'Chinonso Onah'
  }
];

export const milestones: Milestone[] = [
  { id: 'mile_1', projectId: 'project_1', name: 'Merchant statement exports', dueAt: '2026-03-18T09:00:00.000Z', status: 'due_soon', amountUsd: 2500 },
  { id: 'mile_2', projectId: 'project_1', name: 'Audit-ready reconciliation', dueAt: '2026-03-25T09:00:00.000Z', status: 'upcoming', amountUsd: 3000 },
  { id: 'mile_3', projectId: 'project_3', name: 'Approve settlement flows', dueAt: '2026-03-15T13:00:00.000Z', status: 'due_soon', amountUsd: 4200 }
];

export const invoices: Invoice[] = [
  { id: 'inv_1', clientId: 'client_1', projectId: 'project_1', status: 'sent', amountUsd: 2100, dueAt: '2026-03-17T00:00:00.000Z', number: 'INV-2026-031' },
  { id: 'inv_2', clientId: 'client_2', projectId: 'project_2', status: 'overdue', amountUsd: 3800, dueAt: '2026-03-07T00:00:00.000Z', number: 'INV-2026-027' },
  { id: 'inv_3', clientId: 'client_3', projectId: 'project_3', status: 'paid', amountUsd: 6400, dueAt: '2026-03-01T00:00:00.000Z', number: 'INV-2026-021' }
];

export const paymentLinks: PaymentLink[] = [
  { id: 'plink_1', clientId: 'client_1', status: 'active', amountUsd: 950, title: 'Design QA sprint', asset: 'USDC', chain: 'Base' },
  { id: 'plink_2', clientId: 'client_3', status: 'paid', amountUsd: 1800, title: 'Launch bonus', asset: 'USDC', chain: 'Solana' }
];

export const invoiceDrafts: InvoiceDraft[] = [
  {
    id: 'draft_inv_1',
    prompt: 'Invoice Northstar Labs $2,100 for March payout dashboard milestone due next Friday.',
    clientName: 'Northstar Labs',
    amountUsd: 2100,
    dueAt: '2026-03-21T00:00:00.000Z',
    lineItems: [
      { label: 'Payout dashboard milestone', amountUsd: 1800 },
      { label: 'Support and review', amountUsd: 300 }
    ]
  }
];

export const paymentLinkDrafts: PaymentLinkDraft[] = [
  {
    id: 'draft_link_1',
    prompt: 'Create a USDC payment link on Base for $950 for design QA sprint.',
    title: 'Design QA sprint',
    amountUsd: 950,
    asset: 'USDC',
    chain: 'Base',
    memo: '3-day turnaround'
  }
];

export const contracts: Contract[] = [
  { id: 'contract_1', clientId: 'client_1', title: 'Northstar annual advisory agreement', status: 'review' },
  { id: 'contract_2', clientId: 'client_3', title: 'Zuri stablecoin operations retainer', status: 'signed', signedAt: '2026-02-24T10:00:00.000Z' }
];

export const walletAccounts: WalletAccount[] = [
  { id: 'wa_1', chain: 'Base', address: '0x5802Ae8A6BD51e98cA8770a97946ECF886500c67', label: 'Primary base wallet' },
  { id: 'wa_2', chain: 'Solana', address: '6Hh6y1YQF6zKRu1t7z2Q4mN7TZ3xvE1LQW4j9sWcF9Wq', label: 'Operations solana wallet' }
];

export const walletAssets: WalletAsset[] = [
  { id: 'asset_1', symbol: 'USDC', name: 'USD Coin', chain: 'Base', balance: 12450.2, valueUsd: 12450.2, changePct24h: 0.1 },
  { id: 'asset_2', symbol: 'SOL', name: 'Solana', chain: 'Solana', balance: 18.2, valueUsd: 2785.4, changePct24h: 3.4 },
  { id: 'asset_3', symbol: 'ETH', name: 'Ethereum', chain: 'Base', balance: 1.46, valueUsd: 5610.3, changePct24h: 2.1 }
];

export const walletTransactions: WalletTransaction[] = [
  { id: 'wtx_1', kind: 'receive', asset: 'USDC', amount: 1800, chain: 'Base', createdAt: '2026-03-12T08:00:00.000Z', counterparty: 'Zuri Capital' },
  { id: 'wtx_2', kind: 'send', asset: 'USDC', amount: 420, chain: 'Base', createdAt: '2026-03-11T16:00:00.000Z', counterparty: 'Vendor ops wallet' },
  { id: 'wtx_3', kind: 'settlement', asset: 'USDC', amount: 1250, chain: 'Solana', createdAt: '2026-03-10T12:00:00.000Z', counterparty: 'Bridge USD settlement' }
];

export const usdAccount: UsdAccount = {
  id: 'usd_1',
  provider: 'Bridge',
  status: 'active',
  bankName: 'Lead Bank',
  accountNumberMasked: '***374992',
  routingNumberMasked: '***19644',
  balanceUsd: 4820,
  settlementChain: 'Base'
};

export const accountTransactions: AccountTransaction[] = [
  { id: 'acctx_1', type: 'incoming_ach', amountUsd: 3500, status: 'completed', createdAt: '2026-03-11T09:30:00.000Z', description: 'Client ACH deposit from Northstar Labs' },
  { id: 'acctx_2', type: 'usdc_settlement', amountUsd: 1250, status: 'completed', createdAt: '2026-03-10T12:10:00.000Z', description: 'Auto-settlement to Base USDC' },
  { id: 'acctx_3', type: 'incoming_wire', amountUsd: 700, status: 'pending', createdAt: '2026-03-12T14:00:00.000Z', description: 'Pending inbound bank transfer' }
];

export const offrampTransactions: OfframpTransaction[] = [
  { id: 'off_1', asset: 'USDC', amount: 850, fiatCurrency: 'NGN', fiatAmount: 1275000, status: 'processing', destinationLabel: 'GTBank • 3749', createdAt: '2026-03-12T13:00:00.000Z' },
  { id: 'off_2', asset: 'USDC', amount: 320, fiatCurrency: 'KES', fiatAmount: 41440, status: 'completed', destinationLabel: 'M-Pesa • 9012', createdAt: '2026-03-11T11:00:00.000Z' }
];

export const reminders: Reminder[] = [
  { id: 'rem_1', kind: 'deadline', title: 'Creator payout dashboard due in 3 days', dueAt: '2026-03-15T09:00:00.000Z' },
  { id: 'rem_2', kind: 'invoice', title: 'INV-2026-031 due Monday', dueAt: '2026-03-17T00:00:00.000Z' },
  { id: 'rem_3', kind: 'follow_up', title: 'Follow up with Atlas Commerce on overdue payment', dueAt: '2026-03-14T10:00:00.000Z' }
];

export const notifications: Notification[] = [
  { id: 'notif_1', type: 'payment', title: 'Payment link paid', body: 'Zuri Capital paid $1,800 in USDC on Solana.', createdAt: '2026-03-12T09:00:00.000Z', read: false },
  { id: 'notif_2', type: 'deadline', title: 'Milestone due soon', body: 'Merchant statement exports is due in 3 days.', createdAt: '2026-03-12T07:30:00.000Z', read: false },
  { id: 'notif_3', type: 'wallet', title: 'USDC received', body: 'You received 1,800 USDC on Base.', createdAt: '2026-03-11T18:10:00.000Z', read: true }
];

export const activities: Activity[] = [
  { id: 'act_1', actor: 'Hedwig AI', summary: 'Drafted an invoice for Northstar Labs from a prompt.', createdAt: '2026-03-12T09:20:00.000Z', category: 'payment' },
  { id: 'act_2', actor: 'Bridge', summary: 'Created USD account details and synced account activity.', createdAt: '2026-03-11T10:20:00.000Z', category: 'wallet' },
  { id: 'act_3', actor: 'Chinonso', summary: 'Updated stablecoin billing revamp milestone plan.', createdAt: '2026-03-10T15:20:00.000Z', category: 'project' }
];
