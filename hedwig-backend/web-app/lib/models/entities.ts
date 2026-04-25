export type EntityId = string;

export interface User {
  id: EntityId;
  privyId: string;
  workspaceId: EntityId;
  email: string;
  firstName: string;
  lastName: string;
  role: 'owner' | 'member';
  avatarUrl?: string;
  ethereumWalletAddress?: string;
  solanaWalletAddress?: string;
  monthlyTarget?: number;
}

export interface Workspace {
  id: EntityId;
  name: string;
  slug: string;
  plan: 'beta' | 'growth' | 'scale';
  timezone: string;
}

export interface WorkspaceMember {
  id: EntityId;
  workspaceId: EntityId;
  userId: EntityId;
  role: 'owner' | 'finance' | 'ops';
}

export interface Client {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  company?: string;
  email: string;
  phone?: string;
  address?: string;
  notes?: string;
  walletAddress?: string;
  status: 'active' | 'at_risk' | 'inactive';
  totalBilledUsd: number;
  outstandingUsd: number;
  lastActivityAt: string;
}

export interface Project {
  id: EntityId;
  clientId: EntityId;
  workspaceId: EntityId;
  name: string;
  status: 'active' | 'paused' | 'completed';
  budgetUsd: number;
  progress: number;
  nextDeadlineAt: string;
  ownerName: string;
  hasContract?: boolean;
  contract?: {
    id: EntityId;
    title: string;
    status: Contract['status'];
  } | null;
}

export interface Milestone {
  id: EntityId;
  projectId: EntityId;
  name: string;
  dueAt: string;
  status: 'upcoming' | 'due_soon' | 'done' | 'late';
  amountUsd?: number;
  invoiceId?: string;
}

export interface Invoice {
  id: EntityId;
  clientId: EntityId;
  projectId?: EntityId;
  title?: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue';
  amountUsd: number;
  dueAt: string;
  number: string;
  remindersEnabled?: boolean;
  recurringInvoiceId?: string;
  clientEmail?: string;
  viewedAt?: string;
  source?: string | null;
}

export interface PaymentLink {
  id: EntityId;
  clientId?: EntityId;
  status: 'active' | 'paid' | 'expired';
  amountUsd: number;
  title: string;
  asset: 'USDC';
  chain: string;
  remindersEnabled?: boolean;
  clientEmail?: string;
}

export interface InvoiceDraft {
  id: EntityId;
  prompt: string;
  clientName: string;
  amountUsd: number;
  dueAt: string;
  lineItems: Array<{ label: string; amountUsd: number }>;
}

export interface PaymentLinkDraft {
  id: EntityId;
  prompt: string;
  title: string;
  amountUsd: number;
  asset: 'USDC';
  chain: string;
  memo?: string;
}

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

export interface RecurringInvoice {
  id: EntityId;
  clientId?: EntityId;
  clientName?: string;
  clientEmail?: string;
  projectId?: EntityId;
  title: string;
  amountUsd: number;
  currency: string;
  chain: string;
  memo?: string;
  items: any[];
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  nextDueDate: string;
  status: 'active' | 'paused' | 'cancelled';
  autoSend: boolean;
  generatedCount: number;
  createdAt: string;
}

export interface Contract {
  id: EntityId;
  clientId: EntityId;
  title: string;
  status: 'draft' | 'review' | 'signed';
  signedAt?: string;
  clientName?: string;
  projectId?: EntityId;
}

export interface WalletAccount {
  id: EntityId;
  chain: string;
  address: string;
  label: string;
}

export interface WalletAsset {
  id: EntityId;
  symbol: string;
  name: string;
  chain: string;
  balance: number;
  valueUsd: number;
  changePct24h: number;
}

export interface WalletTransaction {
  id: EntityId;
  kind: 'receive' | 'send' | 'payment' | 'settlement';
  asset: string;
  amount: number;
  chain: string;
  createdAt: string;
  counterparty: string;
}

export interface UsdAccount {
  id: EntityId;
  provider: 'Bridge';
  status: 'not_started' | 'pending_kyc' | 'active';
  featureEnabled?: boolean;
  diditKycStatus?: string;
  bridgeKycStatus?: string;
  accountStatusRaw?: string;
  bridgeCustomerId?: string;
  bankName?: string;
  accountNumberMasked?: string;
  routingNumberMasked?: string;
  balanceUsd: number;
  settlementChain: 'Base' | 'Solana';
  settlementToken?: 'USDC';
  hasAssignedAccount?: boolean;
}

export interface AccountTransaction {
  id: EntityId;
  type: 'incoming_ach' | 'incoming_wire' | 'usdc_settlement';
  amountUsd: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  description: string;
}

export interface OfframpTransaction {
  id: EntityId;
  paycrestOrderId?: string;
  asset: string;
  amount: number;
  fiatCurrency: string;
  fiatAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  destinationLabel: string;
  createdAt: string;
  txHash?: string;
  errorMessage?: string;
}

export interface Reminder {
  id: EntityId;
  kind: 'deadline' | 'invoice' | 'follow_up';
  title: string;
  dueAt: string;
}

export interface Notification {
  id: EntityId;
  type: 'payment' | 'deadline' | 'contract' | 'wallet' | 'account';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  metadata?: Record<string, unknown>;
}

export interface Activity {
  id: EntityId;
  actor: string;
  summary: string;
  createdAt: string;
  category: 'client' | 'project' | 'payment' | 'wallet';
}
