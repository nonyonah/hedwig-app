import { backendConfig } from '@/lib/auth/config';
import {
  accountTransactions as mockAccountTransactions,
  activities as mockActivities,
  clients as mockClients,
  contracts as mockContracts,
  currentUser,
  invoices as mockInvoices,
  invoiceDrafts,
  milestones as mockMilestones,
  notifications as mockNotifications,
  offrampTransactions as mockOfframpTransactions,
  paymentLinkDrafts,
  paymentLinks as mockPaymentLinks,
  projects as mockProjects,
  reminders as mockReminders,
  usdAccount as mockUsdAccount,
  walletAccounts as mockWalletAccounts,
  walletAssets as mockWalletAssets,
  walletTransactions as mockWalletTransactions,
  workspace
} from '@/lib/mock/data';
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
  RecurringFrequency,
  RecurringInvoice,
  Reminder,
  UsdAccount,
  User,
  WalletAccount,
  WalletAsset,
  WalletTransaction
} from '@/lib/models/entities';

export type { RecurringInvoice, RecurringFrequency };

export interface CreateRecurringInvoiceInput {
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  projectId?: string;
  title?: string;
  amount: number;
  currency?: string;
  chain?: string;
  memo?: string;
  items?: any[];
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  autoSend: boolean;
}

const wait = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

interface ApiOptions {
  accessToken?: string | null;
  disableMockFallback?: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { message?: string } | string;
}

export interface UpdateUserProfileInput {
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
}

export interface KycStatusSummary {
  status: 'not_started' | 'pending' | 'approved' | 'rejected' | 'retry_required';
  sessionId?: string | null;
  reviewedAt?: string | null;
  isApproved: boolean;
}

export interface BillingStatusSummary {
  plan: 'free' | 'pro';
  appUserId: string;
  entitlement: {
    id: string;
    isActive: boolean;
    expiresAt: string | null;
    productId: string | null;
    store: string | null;
    environment: string | null;
    willRenew: boolean | null;
    isTrial: boolean;
    billingIssueDetected: boolean;
    latestEventType: string | null;
    latestEventAt: string | null;
    updatedAt: string | null;
  };
  featureFlags: {
    webCheckoutEnabled: boolean;
    mobilePaywallEnabled: boolean;
    enforcementEnabled: boolean;
  };
}

export interface BillingCheckoutConfigSummary {
  appUserId: string;
  plan: 'free' | 'pro';
  entitlement: {
    id: string;
    isActive: boolean;
  };
  pricing: {
    monthly: {
      id: string;
      interval: 'monthly';
      priceUsd: number;
      label: string;
    };
    annual: {
      id: string;
      interval: 'annual';
      priceUsd: number;
      label: string;
      monthlyEquivalentUsd: number;
      discountPercent: number;
    };
  };
  checkout: {
    monthlyEnabled: boolean;
    annualEnabled: boolean;
  };
}

export interface CreateClientInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  walletAddress?: string;
  notes?: string;
}

export interface CreateProjectMilestoneInput {
  title: string;
  amount: number;
  dueDate?: string;
}

export interface CreateProjectFlowInput {
  title: string;
  description?: string;
  budget?: number;
  currency?: string;
  deadline: string;
  startDate?: string;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  milestones: CreateProjectMilestoneInput[];
}

export interface UpdateClientInput {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  walletAddress?: string;
  notes?: string;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string;
  budget?: number;
  currency?: string;
  deadline?: string;
  startDate?: string;
  status?: 'active' | 'paused' | 'completed';
}

const normalizeClientStatus = (value?: string | null): Client['status'] => {
  const status = String(value || 'active').toLowerCase();
  if (status === 'at_risk') return 'at_risk';
  if (status === 'inactive') return 'inactive';
  return 'active';
};

const normalizeProjectStatus = (value?: string | null): Project['status'] => {
  const status = String(value || 'active').toLowerCase();
  if (status === 'paused') return 'paused';
  if (status === 'completed' || status === 'done') return 'completed';
  return 'active';
};

const normalizeUsdStatus = (value?: string | null): UsdAccount['status'] => {
  const status = String(value || 'not_started').toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'pending_kyc' || status === 'pending' || status === 'under_review') return 'pending_kyc';
  return 'not_started';
};

const normalizeNotificationType = (value?: string | null): Notification['type'] => {
  const type = String(value || '').toLowerCase();
  if (type.includes('wallet') || type.includes('crypto')) return 'wallet';
  if (type.includes('account') || type.includes('ach')) return 'account';
  if (type.includes('contract')) return 'contract';
  if (type.includes('deadline') || type.includes('reminder')) return 'deadline';
  return 'payment';
};

const normalizeInvoiceStatus = (value?: string | null): Invoice['status'] => {
  const status = String(value || '').toLowerCase();
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'viewed') return 'viewed';
  if (status === 'sent') return 'sent';
  return 'draft';
};

const normalizePaymentLinkStatus = (value?: string | null): PaymentLink['status'] => {
  const status = String(value || '').toLowerCase();
  if (status === 'paid') return 'paid';
  if (status === 'expired') return 'expired';
  return 'active';
};

const normalizeContractStatus = (value?: string | null): Contract['status'] => {
  const status = String(value || '').toLowerCase();
  if (status === 'approved' || status === 'signed' || status === 'completed') return 'signed';
  if (status === 'draft') return 'draft';
  return 'review';
};

const normalizeWalletTransactionKind = (value?: string | null): WalletTransaction['kind'] => {
  const kind = String(value || '').toLowerCase();
  if (kind.includes('receive') || kind === 'in' || kind.includes('received')) return 'receive';
  if (kind.includes('settlement')) return 'settlement';
  if (kind.includes('payment')) return 'payment';
  return 'send';
};

const assetNameBySymbol: Record<string, string> = {
  USDC: 'USD Coin'
};

const supportedWalletAssets = new Set(['Base:USDC', 'Solana:USDC', 'Arbitrum:USDC', 'Polygon:USDC', 'Celo:USDC']);
const walletAssetDecimals: Record<string, number> = {
  USDC: 6
};

const parseNumericValue = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return 0;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const rawUnitsToTokenAmount = (rawValue: unknown, decimals: number): number => {
  if (rawValue === null || rawValue === undefined) return 0;

  const rawString = String(rawValue).trim();
  if (!rawString || !/^\d+$/.test(rawString)) return 0;

  const isNegative = rawString.startsWith('-');
  const digits = isNegative ? rawString.slice(1) : rawString;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const fractional = padded.slice(-decimals).replace(/0+$/, '');
  const normalized = fractional ? `${whole}.${fractional}` : whole;
  const parsed = Number(`${isNegative ? '-' : ''}${normalized}`);

  return Number.isFinite(parsed) ? parsed : 0;
};

const getWalletTokenBalance = (balance: any, symbol: string): number => {
  const displayToken =
    parseNumericValue(balance?.display_values?.token) ||
    parseNumericValue(balance?.displayValues?.token) ||
    parseNumericValue(balance?.display_value?.token) ||
    parseNumericValue(balance?.displayValue?.amount) ||
    parseNumericValue(balance?.formatted_balance);

  if (displayToken > 0) {
    return displayToken;
  }

  const decimals = walletAssetDecimals[symbol];
  if (decimals === undefined) return 0;

  return rawUnitsToTokenAmount(balance?.raw_value ?? balance?.rawValue, decimals);
};

const getWalletUsdValue = (balance: any): number =>
  parseNumericValue(balance?.display_values?.usd) ||
  parseNumericValue(balance?.displayValues?.usd) ||
  parseNumericValue(balance?.display_value?.usd) ||
  parseNumericValue(balance?.usd_value) ||
  parseNumericValue(balance?.usdValue);

const mapBackendUser = (user: any): User => ({
  id: String(user?.id ?? currentUser.id),
  privyId: String(user?.privyId ?? user?.privy_id ?? currentUser.privyId),
  workspaceId: workspace.id,
  email: String(user?.email ?? currentUser.email),
  firstName: String(user?.firstName ?? user?.first_name ?? currentUser.firstName),
  lastName: String(user?.lastName ?? user?.last_name ?? currentUser.lastName),
  role: 'owner',
  avatarUrl: user?.avatar ?? user?.avatarUrl ?? undefined,
  ethereumWalletAddress: user?.ethereumWalletAddress ?? user?.ethereum_wallet_address ?? user?.baseWalletAddress ?? undefined,
  solanaWalletAddress: user?.solanaWalletAddress ?? user?.solana_wallet_address ?? undefined,
  monthlyTarget: typeof user?.monthlyTarget === 'number'
    ? user.monthlyTarget
    : typeof user?.monthly_target === 'number'
      ? user.monthly_target
      : undefined
});

const mapBackendClient = (client: any): Client => ({
  id: String(client.id),
  workspaceId: workspace.id,
  name: String(client.name || 'Unnamed client'),
  company: client.company || undefined,
  email: String(client.email || 'unknown@client.com'),
  phone: client.phone || undefined,
  address: client.address || undefined,
  notes: client.notes || undefined,
  walletAddress: client.walletAddress || client.wallet_address || undefined,
  status: normalizeClientStatus(client.status),
  totalBilledUsd: Number(client.totalBilledUsd ?? client.totalEarnings ?? 0),
  outstandingUsd: Number(client.outstandingUsd ?? client.outstandingBalance ?? 0),
  lastActivityAt: String(client.updatedAt ?? client.createdAt ?? new Date().toISOString())
});

const mapCreatedClient = (client: any): Client => ({
  id: String(client.id),
  workspaceId: workspace.id,
  name: String(client.name || 'Unnamed client'),
  company: client.company || undefined,
  email: String(client.email || 'unknown@client.com'),
  phone: client.phone || undefined,
  address: client.address || undefined,
  notes: client.notes || undefined,
  walletAddress: client.walletAddress || client.wallet_address || undefined,
  status: 'active',
  totalBilledUsd: Number(client.totalBilledUsd ?? client.totalEarnings ?? 0),
  outstandingUsd: Number(client.outstandingUsd ?? client.outstandingBalance ?? 0),
  lastActivityAt: String(client.updatedAt ?? client.createdAt ?? new Date().toISOString())
});

const mapBackendProject = (project: any): Project => ({
  id: String(project.id),
  clientId: String(project.clientId || project.client?.id || ''),
  workspaceId: workspace.id,
  name: String(project.title || project.name || 'Untitled project'),
  status: normalizeProjectStatus(project.status),
  budgetUsd: Number(project.budget ?? project.progress?.totalAmount ?? 0),
  progress: Number(project.progress?.percentage ?? project.progress ?? 0),
  nextDeadlineAt: String(project.deadline || project.nextDeadlineAt || project.startDate || new Date().toISOString()),
  ownerName: currentUser.firstName + ' ' + currentUser.lastName,
  hasContract: Boolean(project.hasContract || project.contract),
  contract: project.contract
    ? {
        id: String(project.contract.id),
        title: String(project.contract.title || 'Contract'),
        status: normalizeContractStatus(project.contract.status)
      }
    : null
});

const mapCreatedProject = (project: any, clientId: string): Project => ({
  id: String(project.id),
  clientId: String(project.clientId || clientId || ''),
  workspaceId: workspace.id,
  name: String(project.title || project.name || 'Untitled project'),
  status: normalizeProjectStatus(project.status),
  budgetUsd: Number(project.budget ?? 0),
  progress: Number(project.progress?.percentage ?? 0),
  nextDeadlineAt: String(project.deadline || project.nextDeadlineAt || new Date().toISOString()),
  ownerName: currentUser.firstName + ' ' + currentUser.lastName,
  hasContract: Boolean(project.hasContract || project.contract),
  contract: project.contract
    ? {
        id: String(project.contract.id),
        title: String(project.contract.title || 'Contract'),
        status: normalizeContractStatus(project.contract.status)
      }
    : null
});

const getDocumentContent = (document: any) =>
  document?.content && typeof document.content === 'object' ? document.content : {};

const deriveDocumentDueAt = (document: any) => {
  const content = getDocumentContent(document);
  return String(
    content.due_date ||
      content.dueAt ||
      document.due_at ||
      document.updated_at ||
      document.created_at ||
      new Date().toISOString()
  );
};

const documentMatchesClient = (document: any, client: Client) => {
  const content = getDocumentContent(document);
  const clientId = document.client_id ? String(document.client_id) : '';
  const emails = [content.recipient_email, content.client_email, document.recipient_email]
    .filter(Boolean)
    .map((value: string) => String(value).toLowerCase());
  const names = [content.client_name, document.client_name]
    .filter(Boolean)
    .map((value: string) => String(value).toLowerCase());

  return (
    clientId === client.id ||
    emails.includes(client.email.toLowerCase()) ||
    names.includes(client.name.toLowerCase())
  );
};

const mapBackendInvoice = (document: any): Invoice => {
  const content = getDocumentContent(document);
  return {
    id: String(document.id),
    clientId: String(document.client_id || ''),
    projectId: document.project_id ? String(document.project_id) : undefined,
    title: document.title ? String(document.title) : undefined,
    status: normalizeInvoiceStatus(document.status),
    amountUsd: Number(document.amount || 0),
    dueAt: deriveDocumentDueAt(document),
    number: `INV-${String(document.id).slice(-6).toUpperCase()}`,
    remindersEnabled: content.reminders_enabled !== false,
    recurringInvoiceId: content.recurring_invoice_id || undefined,
    clientEmail: content.recipient_email || content.client_email || undefined,
    viewedAt: content.viewed_at || content.first_viewed_at || undefined,
  };
};

const mapBackendPaymentLink = (document: any): PaymentLink => {
  const content = getDocumentContent(document);
  const currency = String(document.currency || content.currency || 'USDC').toUpperCase();
  const chainValue = String(content.chain || content.network || document.network || 'BASE').toUpperCase();

  return {
    id: String(document.id),
    clientId: document.client_id ? String(document.client_id) : undefined,
    status: normalizePaymentLinkStatus(document.status),
    amountUsd: Number(document.amount || 0),
    title: String(document.title || 'Payment link'),
    asset: 'USDC',
    chain: chainValue === 'SOLANA' ? 'Solana' : 'Base',
    remindersEnabled: content.reminders_enabled !== false,
    clientEmail: content.recipient_email || content.client_email || undefined,
  };
};

const mapBackendContract = (document: any): Contract => {
  const content = getDocumentContent(document);
  const status = normalizeContractStatus(document.status);
  return {
    id: String(document.id),
    clientId: String(document.client_id || ''),
    title: String(document.title || 'Contract'),
    status,
    signedAt:
      status === 'signed'
        ? String(content.signed_at || content.approved_at || document.updated_at || document.created_at)
        : undefined,
    clientName: content.client_name || undefined,
    projectId: document.project_id ? String(document.project_id) : undefined
  };
};

const mapBackendReminder = (event: any): Reminder => ({
  id: String(event.id),
  kind:
    String(event.eventType || '').toLowerCase().includes('invoice')
      ? 'invoice'
      : String(event.eventType || '').toLowerCase().includes('follow')
        ? 'follow_up'
        : 'deadline',
  title: String(event.title || 'Reminder'),
  dueAt: String(event.eventDate || new Date().toISOString())
});

const mapBackendMilestone = (milestone: any, projectId: string): Milestone => {
  const status = String(milestone.status || '').toLowerCase();
  return {
    id: String(milestone.id),
    projectId,
    name: String(milestone.title || 'Milestone'),
    dueAt: String(milestone.dueDate || milestone.due_date || new Date().toISOString()),
    status:
      status === 'paid' || status === 'done'
        ? 'done'
        : status === 'late'
          ? 'late'
          : status === 'due_soon'
            ? 'due_soon'
            : 'upcoming',
    amountUsd: Number(milestone.amount || 0)
  };
};

const mapRecurringInvoice = (r: any): RecurringInvoice => ({
  id: String(r.id),
  clientId: r.clientId || r.client_id || undefined,
  clientName: r.clientName || r.client_name || undefined,
  clientEmail: r.clientEmail || r.client_email || undefined,
  projectId: r.projectId || r.project_id || undefined,
  title: String(r.title || ''),
  amountUsd: Number(r.amountUsd || r.amount || 0),
  currency: String(r.currency || 'USDC'),
  chain: String(r.chain || 'BASE'),
  memo: r.memo || undefined,
  items: r.items || [],
  frequency: r.frequency as RecurringFrequency,
  startDate: String(r.startDate || r.start_date || ''),
  endDate: r.endDate || r.end_date || undefined,
  nextDueDate: String(r.nextDueDate || r.next_due_date || ''),
  status: r.status as RecurringInvoice['status'],
  autoSend: Boolean(r.autoSend ?? r.auto_send),
  generatedCount: Number(r.generatedCount ?? r.generated_count ?? 0),
  createdAt: String(r.createdAt || r.created_at || new Date().toISOString()),
});

async function fetchDocuments(options?: ApiOptions, type?: string) {
  const query = type ? `/api/documents?type=${encodeURIComponent(type)}` : '/api/documents';
  const data = await request<{ documents: any[] }>(query, options);
  return data.documents || [];
}

const mapBackendNotification = (notification: any): Notification => ({
  id: String(notification.id),
  type: normalizeNotificationType(notification.type),
  title: String(notification.title || 'Notification'),
  body: String(notification.message || notification.body || ''),
  createdAt: String(notification.created_at || notification.createdAt || new Date().toISOString()),
  read: Boolean(notification.is_read ?? notification.read ?? false),
  href: typeof notification.href === 'string'
    ? notification.href
    : typeof notification.metadata?.href === 'string'
      ? notification.metadata.href
      : null,
  entityId: notification.entityId || notification.metadata?.entityId || notification.metadata?.document_id || null,
  entityType: notification.entityType || notification.metadata?.entityType || notification.metadata?.document_type || null,
  metadata: notification.metadata || undefined,
});

const mapBackendTransaction = (transaction: any): WalletTransaction => ({
  id: String(transaction.id),
  kind: normalizeWalletTransactionKind(transaction.type ?? transaction.kind),
  asset: String(transaction.token || transaction.asset || 'USDC'),
  amount: Number(transaction.amount || 0),
  chain: String(transaction.network || transaction.chain || 'base').toLowerCase() === 'solana' ? 'Solana' : 'Base',
  createdAt: String(transaction.date || transaction.created_at || transaction.createdAt || new Date().toISOString()),
  counterparty: String(transaction.description || transaction.to || transaction.from || 'Counterparty')
});

const mapBackendUsdAccount = (details: any, balanceUsd = 0): UsdAccount => ({
  id: String(details.bridgeVirtualAccountId || details.bridgeCustomerId || 'usd-account'),
  provider: 'Bridge',
  status: normalizeUsdStatus(details.accountStatus || details.provider_status),
  featureEnabled: details.featureEnabled !== false,
  diditKycStatus: String(details.diditKycStatus || 'not_started').toLowerCase(),
  bridgeKycStatus: String(details.bridgeKycStatus || details.bridge_kyc_status || 'not_started').toLowerCase(),
  accountStatusRaw: String(details.accountStatus || details.provider_status || 'not_started').toLowerCase(),
  bridgeCustomerId: details.bridgeCustomerId || details.bridge_customer_id ? String(details.bridgeCustomerId || details.bridge_customer_id) : undefined,
  bankName: details.ach?.bankName || undefined,
  accountNumberMasked: details.ach?.accountNumberMasked || undefined,
  routingNumberMasked: details.ach?.routingNumberMasked || undefined,
  balanceUsd,
  settlementChain:
    String(details.settlement?.chain || details.settlementChain || 'BASE').toUpperCase() === 'SOLANA' ? 'Solana' : 'Base',
  settlementToken:
    String(details.settlement?.token || details.settlementToken || 'USDC').toUpperCase() === 'USDC' ? 'USDC' : 'USDC',
  hasAssignedAccount: Boolean(
    details.ach?.accountNumberMasked ||
    details.ach?.routingNumberMasked ||
    details.ach_account_number_masked ||
    details.ach_routing_number_masked
  )
});

const mapBackendUsdTransfer = (transfer: any): AccountTransaction => ({
  id: String(transfer.id),
  type: transfer.sourceType === 'EXTERNAL_ADDRESS'
    ? 'usdc_settlement'
    : transfer.sourceType === 'ACH'
      ? 'incoming_ach'
      : 'incoming_wire',
  amountUsd: Number(transfer.netUsd ?? transfer.grossUsd ?? 0),
  status: String(transfer.status || 'pending').toLowerCase() === 'completed' ? 'completed' : String(transfer.status || '').toLowerCase() === 'failed' ? 'failed' : 'pending',
  createdAt: String(transfer.createdAt || new Date().toISOString()),
  description: String(transfer.sourceLabel || 'USD account transfer')
});

const mapBackendOfframp = (order: any): OfframpTransaction => ({
  id: String(order.id),
  paycrestOrderId: order.paycrestOrderId || order.paycrest_order_id ? String(order.paycrestOrderId || order.paycrest_order_id) : undefined,
  asset: String(order.token || 'USDC'),
  amount: Number(order.cryptoAmount || 0),
  fiatCurrency: String(order.fiatCurrency || 'USD'),
  fiatAmount: Number(order.fiatAmount || 0),
  status: String(order.status || 'pending').toLowerCase() === 'processing'
    ? 'processing'
    : String(order.status || '').toLowerCase() === 'completed'
      ? 'completed'
      : String(order.status || '').toLowerCase() === 'failed'
        ? 'failed'
        : 'pending',
  destinationLabel: `${order.bankName || 'Bank'}${order.accountNumber ? ` • ${String(order.accountNumber).slice(-4)}` : ''}`,
  createdAt: String(order.createdAt || new Date().toISOString()),
  txHash: order.txHash || order.tx_hash || undefined,
  errorMessage: order.errorMessage || order.error_message || undefined
});

const shouldUseMockFallback = (options?: ApiOptions) => options?.accessToken === 'demo';

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'x-hedwig-shared-backend': backendConfig.apiBaseUrl
});

async function request<T>(path: string, options?: ApiOptions, init?: RequestInit): Promise<T> {
  if (!options?.accessToken) {
    throw new Error(`Missing access token for ${path}`);
  }

  if (options.accessToken === 'demo') {
    throw new Error('This action is not available in demo mode. Sign in to use it.');
  }

  const response = await fetch(`${backendConfig.apiBaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...authHeaders(options.accessToken),
      ...(init?.headers ?? {})
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();

  if (!contentType.includes('application/json')) {
    const snippet = rawBody.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(
      `Expected JSON from ${backendConfig.apiBaseUrl}${path}, but received ${contentType || 'unknown content type'} instead. ` +
      `This usually means the web app is pointing to the wrong server or port. Response started with: ${snippet}`
    );
  }

  let payload: ApiEnvelope<T>;

  try {
    payload = JSON.parse(rawBody) as ApiEnvelope<T>;
  } catch {
    const snippet = rawBody.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(`Failed to parse JSON from ${backendConfig.apiBaseUrl}${path}. Response started with: ${snippet}`);
  }

  if (!response.ok || !payload?.success) {
    const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
    throw new Error(message || `Request failed for ${path}`);
  }

  return payload.data;
}

async function withFallback<T>(loader: () => Promise<T>, fallback: () => T | Promise<T>, options?: ApiOptions): Promise<T> {
  if (shouldUseMockFallback(options)) {
    return fallback();
  }

  if (backendConfig.useMockData) {
    throw new Error('Mock data mode is disabled. Connect the shared backend to load live Hedwig data.');
  }

  return loader();
}

export const hedwigApi = {
  authHeaders,

  async shell(options?: ApiOptions) {
    return withFallback(
      async () => {
        const [auth, unread] = await Promise.all([
          request<{ user: any }>('/api/auth/me', options),
          request<{ unreadCount: number }>('/api/notifications/unread-count', options)
        ]);

        return {
          currentUser: mapBackendUser(auth.user),
          workspace,
          unreadCount: unread.unreadCount
        };
      },
      () => ({
        currentUser,
        workspace,
        unreadCount: mockNotifications.filter((item) => !item.read).length
      }),
      options
    );
  },

  async dashboard(options?: ApiOptions) {
    return withFallback(
      async () => {
        const [clientsData, projectsData, contractsData, walletData, accountsData, notificationsData, shellData, paymentsData, calendarData, assistantSummaryData, recurringData] = await Promise.all([
          this.clients(options),
          this.projects(options),
          this.contracts(options),
          this.wallet(options),
          this.accounts(options),
          this.notifications(options),
          this.shell(options),
          this.payments(options),
          this.calendar(options),
          request<{ summary?: string }>('/api/insights/assistant-summary', options).catch(() => ({ summary: undefined })),
          this.recurringInvoices(options).catch(() => [])
        ]);

        const outstandingUsd = clientsData.reduce((sum, client) => sum + client.outstandingUsd, 0);
        const inflowUsd = paymentsData.invoices
          .filter((invoice) => invoice.status !== 'paid')
          .reduce((sum, invoice) => sum + invoice.amountUsd, 0);
        const milestones = projectsData.flatMap((project: any) =>
          Array.isArray(project.milestones)
            ? project.milestones.map((milestone: any) => mapBackendMilestone(milestone, project.id))
            : []
        );

        return {
          totals: {
            inflowUsd,
            outstandingUsd,
            walletUsd: walletData.walletAssets.reduce((sum, asset) => sum + asset.valueUsd, 0),
            usdAccountUsd: accountsData.usdAccount.balanceUsd
          },
          assistantSummary: assistantSummaryData?.summary || null,
          notifications: notificationsData,
          activities: [
            {
              id: 'activity-shell-sync',
              actor: shellData.currentUser.firstName || 'Hedwig',
              summary: 'Workspace data synced from the shared backend.',
              createdAt: new Date().toISOString(),
              category: 'wallet' as const
            },
            ...mockActivities
          ].slice(0, 5),
          contracts: contractsData,
          invoices: paymentsData.invoices,
          paymentLinks: paymentsData.paymentLinks,
          projects: projectsData,
          milestones,
          reminders: calendarData.reminders,
          recurringCount: (recurringData as any[]).filter((r: any) => r.status === 'active').length
        };
      },
      () => ({
        totals: {
          inflowUsd: 21450,
          outstandingUsd: 5900,
          walletUsd: mockWalletAssets.reduce((sum, asset) => sum + asset.valueUsd, 0),
          usdAccountUsd: mockUsdAccount.balanceUsd
        },
        assistantSummary: null,
        reminders: mockReminders,
        notifications: mockNotifications,
        activities: mockActivities,
        contracts: mockContracts,
        invoices: mockInvoices,
        paymentLinks: mockPaymentLinks,
        projects: mockProjects,
        milestones: mockMilestones,
        recurringCount: 0
      }),
      options
    );
  },

  async clients(options?: ApiOptions): Promise<Client[]> {
    return withFallback(
      async () => {
        const data = await request<{ clients: any[] }>('/api/clients', options);
        return (data.clients || []).map(mapBackendClient);
      },
      () => mockClients,
      options
    );
  },

  async createClient(input: CreateClientInput, options?: ApiOptions): Promise<Client> {
    return withFallback(
      async () => {
        const data = await request<{ client: any }>('/api/clients', options, {
          method: 'POST',
          body: JSON.stringify(input)
        });
        return mapCreatedClient(data.client);
      },
      async () => {
        await wait();
        return mapCreatedClient({
          id: `client_${Date.now()}`,
          ...input,
          totalEarnings: 0,
          outstandingBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      },
      options
    );
  },

  async client(id: string, options?: ApiOptions) {
    return withFallback(
      async () => {
        const [clientData, projectsData, documents] = await Promise.all([
          request<{ client: any }>(`/api/clients/${id}`, options),
          this.projects(options),
          fetchDocuments(options)
        ]);
        const client = mapBackendClient(clientData.client);
        const invoices = documents
          .filter((document) => String(document.type || '').toUpperCase() === 'INVOICE' && documentMatchesClient(document, client))
          .map(mapBackendInvoice);
        const paymentLinks = documents
          .filter((document) => String(document.type || '').toUpperCase() === 'PAYMENT_LINK' && documentMatchesClient(document, client))
          .map(mapBackendPaymentLink);
        const contracts = documents
          .filter((document) => String(document.type || '').toUpperCase() === 'CONTRACT' && documentMatchesClient(document, client))
          .map(mapBackendContract);

        return {
          client,
          projects: projectsData.filter((project) => project.clientId === id),
          invoices,
          paymentLinks,
          contracts
        };
      },
      () => ({
        client: mockClients.find((item) => item.id === id) ?? null,
        projects: mockProjects.filter((item) => item.clientId === id),
        invoices: mockInvoices.filter((item) => item.clientId === id),
        paymentLinks: mockPaymentLinks.filter((item) => item.clientId === id),
        contracts: mockContracts.filter((item) => item.clientId === id)
      }),
      options
    );
  },

  async projects(options?: ApiOptions): Promise<Project[]> {
    return withFallback(
      async () => {
        const data = await request<{ projects: any[] }>('/api/projects', options);
        return (data.projects || []).map(mapBackendProject);
      },
      () => mockProjects,
      options
    );
  },

  async updateClient(id: string, input: UpdateClientInput, options?: ApiOptions): Promise<Client> {
    return withFallback(
      async () => {
        const data = await request<{ client: any }>(`/api/clients/${id}`, options, {
          method: 'PUT',
          body: JSON.stringify(input)
        });
        return mapCreatedClient(data.client);
      },
      async () => {
        await wait();
        return mapCreatedClient({
          id,
          ...input,
          name: input.name || 'Updated client',
          email: input.email || 'unknown@client.com',
          totalEarnings: 0,
          outstandingBalance: 0,
          updatedAt: new Date().toISOString()
        });
      },
      options
    );
  },

  async deleteClient(id: string, options?: ApiOptions): Promise<void> {
    return withFallback(
      async () => {
        await request<{ message?: string }>(`/api/clients/${id}`, options, {
          method: 'DELETE'
        });
      },
      async () => {
        await wait();
      },
      options
    );
  },

  async createProjectFlow(
    input: CreateProjectFlowInput,
    options?: ApiOptions
  ): Promise<{ project: Project; contractId: string | null; createdInvoiceCount: number; contractEmailSent: boolean }> {
    return withFallback(
      async () => {
        const projectPayload = {
          clientId: input.clientId,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          title: input.title,
          description: input.description,
          budget: input.budget ?? 0,
          currency: input.currency ?? 'USD',
          status: 'active',
          startDate: input.startDate ?? new Date().toISOString().split('T')[0],
          deadline: input.deadline,
          milestones: input.milestones.map((milestone) => ({
            title: milestone.title,
            amount: milestone.amount,
            dueDate: milestone.dueDate
          }))
        };

        const projectResponse = await request<{ project: any }>(
          '/api/projects',
          options,
          {
            method: 'POST',
            body: JSON.stringify(projectPayload)
          }
        );

        const createdProject = projectResponse.project;

        return {
          project: mapCreatedProject(createdProject, createdProject.clientId || input.clientId || ''),
          contractId: createdProject.contract?.id ? String(createdProject.contract.id) : null,
          createdInvoiceCount: Number(createdProject.createdInvoiceCount || 0),
          contractEmailSent: Boolean(createdProject.contractEmailSent)
        };
      },
      async () => {
        await wait();
        return {
          project: mapCreatedProject(
            {
              id: `project_${Date.now()}`,
              clientId: input.clientId || `client_${Date.now()}`,
              title: input.title,
              description: input.description,
              status: 'active',
              budget: input.budget ?? 0,
              deadline: input.deadline
            },
            input.clientId || `client_${Date.now()}`
          ),
          contractId: `contract_${Date.now()}`,
          createdInvoiceCount: input.milestones.length,
          contractEmailSent: false
        };
      },
      options
    );
  },

  async project(
    id: string,
    options?: ApiOptions
  ): Promise<{ project: Project | null; milestones: Milestone[]; invoices: Invoice[]; contract: Contract | null }> {
    return withFallback(
      async () => {
        const [data, documents] = await Promise.all([
          request<{ project: any }>(`/api/projects/${id}`, options),
          fetchDocuments(options)
        ]);
        const project = data.project ? mapBackendProject(data.project) : null;
        const milestones = (data.project?.milestones || []).map((milestone: any) => mapBackendMilestone(milestone, id));
        const directContract = data.project?.contract
          ? {
              id: String(data.project.contract.id),
              clientId: String(data.project.clientId || data.project.client?.id || ''),
              title: String(data.project.contract.title || 'Contract'),
              status: normalizeContractStatus(data.project.contract.status),
              projectId: id
            }
          : null;
        const contract = directContract || documents
          .filter((document) => String(document.type || '').toUpperCase() === 'CONTRACT')
          .map(mapBackendContract)
          .find((item) => item.projectId === id) || null;
        const projectTitle = String(data.project?.title || data.project?.name || '');
        const projectClient = data.project?.client;
        const invoices = Array.isArray(data.project?.invoices) && data.project.invoices.length > 0
          ? data.project.invoices.map((invoice: any) => ({
              id: String(invoice.id),
              clientId: String(data.project.clientId || data.project.client?.id || ''),
              projectId: id,
              status: normalizeInvoiceStatus(invoice.status),
              amountUsd: Number(invoice.amount || 0),
              dueAt: String(invoice.dueDate || new Date().toISOString()),
              title: invoice.title ? String(invoice.title) : undefined,
              number: `INV-${String(invoice.id).slice(-6).toUpperCase()}`
            }))
          : documents
              .filter((document) => {
                if (String(document.type || '').toUpperCase() !== 'INVOICE') return false;
                const content = getDocumentContent(document);
                const description = String(document.description || '');
                return (
                  String(document.project_id || '') === id ||
                  String(content.project_id || '') === id ||
                  (projectTitle && description.toLowerCase().includes(projectTitle.toLowerCase())) ||
                  (projectClient?.email && [content.recipient_email, content.client_email].filter(Boolean).map((value: string) => String(value).toLowerCase()).includes(String(projectClient.email).toLowerCase()))
                );
              })
              .map(mapBackendInvoice);

        return {
          project,
          milestones,
          invoices,
          contract
        };
      },
      () => ({
        project: mockProjects.find((item) => item.id === id) ?? null,
        milestones: mockMilestones.filter((item) => item.projectId === id),
        invoices: mockInvoices.filter((item) => item.projectId === id),
        contract: mockContracts.find((item) => item.clientId === mockProjects.find((project) => project.id === id)?.clientId) ?? null
      }),
      options
    );
  },

  async updateProject(id: string, input: UpdateProjectInput, options?: ApiOptions): Promise<Project> {
    return withFallback(
      async () => {
        const data = await request<{ project: any }>(`/api/projects/${id}`, options, {
          method: 'PUT',
          body: JSON.stringify({
            title: input.title,
            description: input.description,
            budget: input.budget,
            currency: input.currency,
            deadline: input.deadline,
            startDate: input.startDate,
            status:
              input.status === 'completed'
                ? 'COMPLETED'
                : input.status === 'paused'
                  ? 'PAUSED'
                  : input.status === 'active'
                    ? 'ACTIVE'
                    : undefined
          })
        });
        return mapBackendProject(data.project);
      },
      async () => {
        await wait();
        return mapCreatedProject(
          {
            id,
            title: input.title || 'Updated project',
            status: input.status || 'active',
            budget: input.budget || 0,
            deadline: input.deadline || new Date().toISOString()
          },
          ''
        );
      },
      options
    );
  },

  async deleteProject(id: string, options?: ApiOptions): Promise<void> {
    return withFallback(
      async () => {
        await request<{ message?: string }>(`/api/projects/${id}`, options, {
          method: 'DELETE'
        });
      },
      async () => {
        await wait();
      },
      options
    );
  },

  async payments(options?: ApiOptions) {
    return withFallback(
      async () => {
        const [invoiceDocuments, paymentLinkDocuments] = await Promise.all([
          fetchDocuments(options, 'INVOICE'),
          fetchDocuments(options, 'PAYMENT_LINK')
        ]);

        return {
          invoices: invoiceDocuments.map(mapBackendInvoice),
          paymentLinks: paymentLinkDocuments.map(mapBackendPaymentLink),
          invoiceDrafts,
          paymentLinkDrafts
        };
      },
      async () => {
        await wait();
        return {
          invoices: mockInvoices,
          paymentLinks: mockPaymentLinks,
          invoiceDrafts,
          paymentLinkDrafts
        };
      },
      options
    );
  },

  async contracts(options?: ApiOptions): Promise<Contract[]> {
    return withFallback(
      async () => {
        const documents = await fetchDocuments(options, 'CONTRACT');
        return documents.map(mapBackendContract);
      },
      async () => {
        await wait();
        return mockContracts;
      },
      options
    );
  },

  async deleteDocument(id: string, options?: ApiOptions): Promise<void> {
    return withFallback(
      async () => {
        await request<{ message?: string }>(`/api/documents/${id}`, options, {
          method: 'DELETE'
        });
      },
      async () => {
        await wait();
      },
      options
    );
  },

  async updateDocumentRecipientEmail(id: string, email: string, options?: ApiOptions): Promise<void> {
    await request<{ document?: any }>(`/api/documents/${id}`, options, {
      method: 'PUT',
      body: JSON.stringify({ content: { recipient_email: email.trim().toLowerCase() } })
    });
  },

  async updateDocumentStatus(id: string, status: string, options?: ApiOptions): Promise<void> {
    return withFallback(
      async () => {
        await request<{ document?: any }>(`/api/documents/${id}/status`, options, {
          method: 'PATCH',
          body: JSON.stringify({ status })
        });
      },
      async () => {
        await wait();
      },
      options
    );
  },

  async remindDocument(id: string, options?: ApiOptions): Promise<void> {
    return withFallback(
      async () => {
        await request<{ message?: string }>(`/api/documents/${id}/remind`, options, {
          method: 'POST'
        });
      },
      async () => {
        await wait();
      },
      options
    );
  },

  async createInvoice(
    data: {
      clientName?: string;
      amount: number;
      description?: string;
      dueDate: string;
      recipientEmail?: string;
    },
    options?: ApiOptions
  ): Promise<Invoice> {
    const result = await request<{ document?: any; invoice?: any }>('/api/documents/invoice', options, {
      method: 'POST',
      body: JSON.stringify({
        clientName: data.clientName,
        amount: data.amount,
        description: data.description,
        dueDate: data.dueDate,
        recipientEmail: data.recipientEmail
      })
    });
    const doc = result.document ?? result.invoice ?? result;
    return {
      id: doc.id,
      clientId: doc.clientId ?? '',
      projectId: doc.projectId,
      status: (doc.status?.toLowerCase() ?? 'draft') as Invoice['status'],
      amountUsd: doc.amount ?? doc.amountUsd ?? data.amount,
      dueAt: doc.dueDate ?? doc.dueAt ?? data.dueDate,
      number: doc.number ?? doc.invoiceNumber ?? `INV-${doc.id?.slice(-6).toUpperCase()}`
    };
  },

  async createPaymentLink(
    data: {
      clientName?: string;
      amount: number;
      description?: string;
      dueDate: string;
      recipientEmail?: string;
      currency?: string;
    },
    options?: ApiOptions
  ): Promise<PaymentLink> {
    const result = await request<{ document?: any; paymentLink?: any }>('/api/documents/payment-link', options, {
      method: 'POST',
      body: JSON.stringify({
        clientName: data.clientName,
        amount: data.amount,
        description: data.description,
        dueDate: data.dueDate,
        recipientEmail: data.recipientEmail,
        currency: data.currency ?? 'USDC'
      })
    });
    const doc = result.document ?? result.paymentLink ?? result;
    return {
      id: doc.id,
      clientId: doc.clientId,
      status: (doc.status?.toLowerCase() ?? 'active') as PaymentLink['status'],
      amountUsd: doc.amount ?? doc.amountUsd ?? data.amount,
      title: doc.title ?? doc.description ?? data.description ?? data.clientName,
      asset: (doc.currency ?? doc.asset ?? 'USDC') as PaymentLink['asset'],
      chain: (doc.chain ?? 'Base') as PaymentLink['chain']
    };
  },

  async parseCreationBox(
    text: string,
    mode: 'auto' | 'payment_link' | 'invoice' | undefined,
    options?: ApiOptions
  ): Promise<{
    intent: 'invoice' | 'payment_link' | 'unknown';
    clientName: string | null;
    clientEmail: string | null;
    amount: number | null;
    dueDate: string | null;
    title: string | null;
    items?: Array<{ description: string; amount: number }>;
    confidence: number;
  } | null> {
    try {
      const result = await request<{ success: boolean; data: any }>('/api/creation-box/parse', options, {
        method: 'POST',
        body: JSON.stringify({ text, currentDate: new Date().toISOString(), mode: mode !== 'auto' ? mode : undefined })
      });
      return (result as any)?.data ?? null;
    } catch {
      return null;
    }
  },

  async toggleDocumentReminders(id: string, enabled: boolean, options?: ApiOptions): Promise<void> {
    return withFallback(
      async () => {
        await request<{ remindersEnabled?: boolean }>(`/api/documents/${id}/toggle-reminders`, options, {
          method: 'POST',
          body: JSON.stringify({ enabled })
        });
      },
      async () => {
        await wait();
      },
      options
    );
  },

  async sendContract(id: string, options?: ApiOptions): Promise<{ emailSent: boolean; clientEmail?: string }> {
    return withFallback(
      async () => {
        const data = await request<{ contract?: any; emailSent?: boolean; clientEmail?: string }>(`/api/documents/${id}/send`, options, {
          method: 'POST'
        });
        return {
          emailSent: Boolean(data.emailSent),
          clientEmail: data.clientEmail
        };
      },
      async () => {
        await wait();
        return { emailSent: false, clientEmail: undefined };
      },
      options
    );
  },

  async wallet(options?: ApiOptions): Promise<{ walletAccounts: WalletAccount[]; walletAssets: WalletAsset[]; walletTransactions: WalletTransaction[] }> {
    return withFallback(
      async () => {
        const [transactionsResult, walletBalanceResult] = await Promise.allSettled([
          request<any[]>('/api/transactions', options),
          request<{ balances: any[]; address: string | null; solanaAddress: string | null }>('/api/wallet/balance', options)
        ]);

        const transactions = transactionsResult.status === 'fulfilled'
          ? transactionsResult.value
          : [];

        const walletBalance = walletBalanceResult.status === 'fulfilled'
          ? walletBalanceResult.value
          : { balances: [], address: null, solanaAddress: null };

        const walletAccounts: WalletAccount[] = [
          walletBalance.address
            ? {
                id: 'wallet-base',
                chain: 'Base',
                address: walletBalance.address,
                label: 'Primary Base wallet'
              }
            : null,
          walletBalance.solanaAddress
            ? {
                id: 'wallet-solana',
                chain: 'Solana',
                address: walletBalance.solanaAddress,
                label: 'Primary Solana wallet'
              }
            : null
        ].filter(Boolean) as WalletAccount[];

        const walletAssets: WalletAsset[] = (walletBalance.balances || []).map((balance, index) => {
          const symbol = String(balance.asset || '').toUpperCase();
          const chain: WalletAsset['chain'] =
            String(balance.chain || '').toLowerCase() === 'solana' ? 'Solana' : 'Base';
          const tokenBalance = getWalletTokenBalance(balance, symbol);
          const usdValue = getWalletUsdValue(balance);

          return {
            id: `${chain.toLowerCase()}-${symbol}-${index}`,
            symbol,
            name: assetNameBySymbol[symbol] || symbol,
            chain,
            balance: tokenBalance,
            valueUsd: usdValue,
            changePct24h: 0
          };
        }).filter((asset) => supportedWalletAssets.has(`${asset.chain}:${asset.symbol}`));

        return {
          walletAccounts,
          walletAssets,
          walletTransactions: (transactions || []).map(mapBackendTransaction)
        };
      },
      () => ({
        walletAccounts: mockWalletAccounts,
        walletAssets: mockWalletAssets,
        walletTransactions: mockWalletTransactions
      }),
      options
    );
  },

  async accounts(options?: ApiOptions): Promise<{ usdAccount: UsdAccount; accountTransactions: AccountTransaction[] }> {
    return withFallback(
      async () => {
        const [statusResult, detailsResult, transfersResult] = await Promise.allSettled([
          request<any>('/api/usd-accounts/status', options),
          request<any>('/api/usd-accounts/details', options),
          request<{ transfers: any[] }>('/api/usd-accounts/transfers', options)
        ]);

        const statusData = statusResult.status === 'fulfilled' ? statusResult.value : null;
        const detailsData = detailsResult.status === 'fulfilled' ? detailsResult.value : null;
        const transfersData = transfersResult.status === 'fulfilled' ? transfersResult.value : { transfers: [] };
        const accountTransactions = (transfersData.transfers || []).map(mapBackendUsdTransfer);
        const derivedBalance = accountTransactions
          .filter((transfer) => transfer.status === 'completed')
          .reduce((sum, transfer) => sum + transfer.amountUsd, 0);

        const accountSource = {
          ...(statusData || {}),
          ...(detailsData || {}),
          settlement: detailsData?.settlement || statusData?.settlement,
          ach: detailsData?.ach || statusData?.ach
        };

        return {
          usdAccount: mapBackendUsdAccount(
            Object.keys(accountSource).length ? accountSource : { accountStatus: 'not_started', settlementChain: 'BASE' },
            derivedBalance
          ),
          accountTransactions
        };
      },
      () => ({
        usdAccount: {
          id: 'usd-account',
          provider: 'Bridge',
          status: 'not_started',
          balanceUsd: 0,
          settlementChain: 'Base'
        },
        accountTransactions: []
      }),
      options
    );
  },

  async enrollUsdAccount(
    options?: ApiOptions
  ): Promise<{
    bridgeCustomerId?: string;
    diditKycStatus?: string;
    bridgeKycStatus?: string;
    accountStatus?: string;
    nextAction?: 'fetch_account_details' | 'complete_bridge_kyc';
  }> {
    return request('/api/usd-accounts/enroll', options, {
      method: 'POST'
    });
  },

  async createUsdAccountKycLink(options?: ApiOptions): Promise<{ url: string; expiresAt?: string | null }> {
    const data = await request<{ url?: string; expiresAt?: string | null }>('/api/usd-accounts/kyc-link', options, {
      method: 'POST'
    });

    return {
      url: String(data?.url || ''),
      expiresAt: data?.expiresAt ?? null
    };
  },

  async offramp(options?: ApiOptions): Promise<OfframpTransaction[]> {
    return withFallback(
      async () => {
        const data = await request<{ orders: any[] }>('/api/offramp/orders', options);
        return (data.orders || []).map(mapBackendOfframp);
      },
      () => mockOfframpTransactions,
      options
    );
  },

  async offrampInstitutions(currency: string, options?: ApiOptions): Promise<Array<{ code: string; name: string }>> {
    const data = await request<{ banks: any[] }>(`/api/offramp/institutions?currency=${currency}`, options);
    return (data.banks || [])
      .map((bank: any) => ({
        code: String(bank?.code || bank?.id || bank?.institution_id || bank?.institutionCode || '').trim(),
        name: String(bank?.name || bank?.institution_name || bank?.displayName || '').trim()
      }))
      .filter((bank) => bank.code && bank.name);
  },

  async offrampRates(
    token: string,
    amount: number,
    currency: string,
    network: string,
    options?: ApiOptions
  ): Promise<{ rate: string; fiatEstimate: number | null; platformFee: number; netCryptoAmount: number }> {
    return request(
      `/api/offramp/rates?token=${token}&amount=${amount}&currency=${currency}&network=${network}`,
      options
    );
  },

  async createOfframp(
    payload: {
      amount: number;
      token: 'USDC';
      network: 'base' | 'solana';
      currency: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
      returnAddress: string;
      memo?: string;
    },
    options?: ApiOptions
  ): Promise<{ orderId: string }> {
    return request('/api/offramp/create', options, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async verifyOfframpAccount(
    payload: { bankName: string; accountNumber: string; currency: string },
    options?: ApiOptions
  ): Promise<{ accountName: string; accountNumber: string }> {
    return request('/api/offramp/verify-account', options, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async bridgeAndOfframp(
    payload: {
      solanaAddress: string;
      baseAddress: string;
      token: string;
      amount: number;
      bankDetails: { bankName: string; accountNumber: string; accountName: string; currency: string };
    },
    options?: ApiOptions
  ): Promise<{ step: string; quote: any; bridgeTransaction: any; offrampDetails: any }> {
    return request('/api/bridge/bridge-and-offramp', options, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async insights(range: string = '30d', options?: ApiOptions) {
    const safeRange = ['7d', '30d', '90d', '1y'].includes(range) ? range : '30d';
    type InsightsResult = {
      range: string;
      lastUpdatedAt: string;
      summary: {
        monthlyEarnings: number;
        previousPeriodEarnings: number;
        earningsDeltaPct: number;
        pendingInvoicesCount: number;
        pendingInvoicesTotal: number;
        paymentRate: number;
        paidDocuments: number;
        totalDocuments: number;
        clientsCount: number;
        activeProjects: number;
        paymentLinksCount: number;
        topClient: { name: string; totalEarnings: number } | null;
        transactionsCount: number;
        receivedAmount: number;
        withdrawalsPending: number;
        withdrawalsCompletedAmount: number;
      };
      series: { earnings: { key: string; value: number }[] };
      insights: Array<{
        id: string;
        title: string;
        description: string;
        priority: number;
        actionLabel?: string;
        actionRoute?: string;
        trend: 'up' | 'down' | 'neutral';
      }>;
    };
    return withFallback(
      () => request<InsightsResult>(`/api/insights/summary?range=${safeRange}`, options),
      (): InsightsResult => ({
        range: safeRange,
        lastUpdatedAt: new Date().toISOString(),
        summary: {
          monthlyEarnings: 12480,
          previousPeriodEarnings: 10200,
          earningsDeltaPct: 22.4,
          pendingInvoicesCount: 2,
          pendingInvoicesTotal: 3200,
          paymentRate: 94,
          paidDocuments: 17,
          totalDocuments: 18,
          clientsCount: mockClients.length,
          activeProjects: mockProjects.filter((p) => p.status === 'active').length,
          paymentLinksCount: mockPaymentLinks.length,
          topClient: { name: 'Aisha Bello', totalEarnings: 18450 },
          transactionsCount: mockWalletTransactions.length,
          receivedAmount: 8240,
          withdrawalsPending: 0,
          withdrawalsCompletedAmount: 3200,
        },
        series: {
          earnings: [
            { key: 'Week 1', value: 2800 },
            { key: 'Week 2', value: 3100 },
            { key: 'Week 3', value: 3400 },
            { key: 'Week 4', value: 3180 },
          ],
        },
        insights: [
          { id: 'i1', title: 'Payment rate is strong', description: '94% of invoices paid on time this period. Keep the momentum.', priority: 1, trend: 'up' },
          { id: 'i2', title: 'Two invoices pending', description: '$3,200 is outstanding. Consider sending a reminder.', priority: 2, actionLabel: 'View payments', actionRoute: '/payments', trend: 'neutral' },
          { id: 'i3', title: 'Earnings up 22% vs last period', description: 'Your strongest month yet. Top client: Aisha Bello.', priority: 3, trend: 'up' },
        ],
      }),
      options
    );
  },

  async userProfile(options?: ApiOptions): Promise<{ monthlyTarget?: number }> {
    if (shouldUseMockFallback(options)) return { monthlyTarget: undefined };
    try {
      const data = await request<{ user?: any }>('/api/auth/me', options);
      const user = data.user || data;
      return { monthlyTarget: typeof user?.monthlyTarget === 'number' ? user.monthlyTarget : undefined };
    } catch {
      return {};
    }
  },

  async billingStatus(options?: ApiOptions): Promise<BillingStatusSummary> {
    if (shouldUseMockFallback(options)) {
      return {
        plan: 'free',
        appUserId: 'mock-user',
        entitlement: {
          id: 'pro',
          isActive: false,
          expiresAt: null,
          productId: null,
          store: null,
          environment: null,
          willRenew: null,
          isTrial: false,
          billingIssueDetected: false,
          latestEventType: null,
          latestEventAt: null,
          updatedAt: null
        },
        featureFlags: {
          webCheckoutEnabled: true,
          mobilePaywallEnabled: false,
          enforcementEnabled: false
        }
      };
    }

    return request<BillingStatusSummary>('/api/billing/status', options);
  },

  async billingCheckoutConfig(options?: ApiOptions): Promise<BillingCheckoutConfigSummary> {
    if (shouldUseMockFallback(options)) {
      return {
        appUserId: 'mock-user',
        plan: 'free',
        entitlement: { id: 'pro', isActive: false },
        pricing: {
          monthly: { id: 'pro-monthly', interval: 'monthly', priceUsd: 5, label: '$5/month' },
          annual: {
            id: 'pro-annual',
            interval: 'annual',
            priceUsd: 48,
            label: '$48/year',
            monthlyEquivalentUsd: 4,
            discountPercent: 20
          }
        },
        checkout: {
          monthlyEnabled: false,
          annualEnabled: false
        }
      };
    }

    return request<BillingCheckoutConfigSummary>('/api/billing/checkout-config', options);
  },

  async getUserProfile(options?: ApiOptions): Promise<User> {
    if (shouldUseMockFallback(options)) return currentUser;
    const data = await request<{ user?: any }>('/api/users/profile', options);
    return mapBackendUser(data.user || data);
  },

  async updateUserProfile(input: UpdateUserProfileInput, options?: ApiOptions): Promise<User> {
    const payload = {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar } : {})
    };

    const data = await request<{ user?: any }>('/api/users/profile', options, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    return mapBackendUser(data.user || data);
  },

  async getKycStatus(options?: ApiOptions): Promise<KycStatusSummary> {
    if (shouldUseMockFallback(options)) return { status: 'not_started', isApproved: false, sessionId: null, reviewedAt: null };
    return request<KycStatusSummary>('/api/kyc/status', options);
  },

  async startKyc(options?: ApiOptions): Promise<{ url?: string; sessionId?: string; status: KycStatusSummary['status']; message?: string }> {
    return request<{ url?: string; sessionId?: string; status: KycStatusSummary['status']; message?: string }>(
      '/api/kyc/start',
      options,
      { method: 'POST' }
    );
  },

  async checkKycStatus(options?: ApiOptions): Promise<{ status: KycStatusSummary['status']; isApproved: boolean }> {
    return request<{ status: KycStatusSummary['status']; isApproved: boolean }>(
      '/api/kyc/check',
      options,
      { method: 'POST' }
    );
  },

  async updateMonthlyTarget(target: number, options?: ApiOptions): Promise<void> {
    await request('/api/users/profile', options, {
      method: 'PATCH',
      body: JSON.stringify({ monthlyTarget: target })
    });
  },

  async calendar(options?: ApiOptions) {
    return withFallback(
      async () => {
        const [calendarData, projectsData, invoiceDocuments] = await Promise.all([
          request<{ events: any[] }>('/api/calendar?limit=200', options),
          this.projects(options),
          fetchDocuments(options, 'INVOICE')
        ]);

        const reminders = (calendarData.events || [])
          .filter((event) => {
            const sourceType = String(event.sourceType || '').toLowerCase();
            return !sourceType || (sourceType !== 'invoice' && sourceType !== 'payment_link' && sourceType !== 'project');
          })
          .map(mapBackendReminder);

        const milestones = projectsData.flatMap((project: any) =>
          Array.isArray(project.milestones)
            ? project.milestones.map((milestone: any) => mapBackendMilestone(milestone, project.id))
            : []
        );

        return {
          reminders,
          milestones,
          invoices: invoiceDocuments.map(mapBackendInvoice),
          projects: projectsData
        };
      },
      async () => {
        await wait();
        return { reminders: mockReminders, milestones: mockMilestones, invoices: mockInvoices, projects: mockProjects };
      },
      options
    );
  },

  async updateCalendarEvent(
    id: string,
    input: { title?: string; eventDate?: string; status?: string; description?: string },
    options?: ApiOptions
  ): Promise<Reminder> {
    return withFallback(
      async () => {
        const data = await request<{ event: any }>(`/api/calendar/${id}`, options, {
          method: 'PATCH',
          body: JSON.stringify(input)
        });
        return mapBackendReminder(data.event);
      },
      async () => {
        await wait();
        return {
          id,
          kind: 'follow_up',
          title: input.title || 'Updated reminder',
          dueAt: input.eventDate || new Date().toISOString()
        };
      },
      options
    );
  },

  async notifications(options?: ApiOptions): Promise<Notification[]> {
    return withFallback(
      async () => {
        const data = await request<{ notifications: any[] }>('/api/notifications?limit=20&offset=0', options);
        return (data.notifications || []).map(mapBackendNotification);
      },
      () => mockNotifications,
      options
    );
  },

  async createInvoiceDraft(prompt: string): Promise<InvoiceDraft> {
    await wait();
    return {
      id: 'draft_invoice_new',
      prompt,
      clientName: 'Prompt matched client',
      amountUsd: 2400,
      dueAt: '2026-03-25T00:00:00.000Z',
      lineItems: [
        { label: 'Core project milestone', amountUsd: 2000 },
        { label: 'Review and QA', amountUsd: 400 }
      ]
    };
  },

  // ── Recurring Invoices ──────────────────────────────────────────────────────

  async recurringInvoices(options?: ApiOptions): Promise<RecurringInvoice[]> {
    if (shouldUseMockFallback(options)) return [];
    const data = await request<{ recurringInvoices: any[] }>('/api/recurring-invoices', options);
    return (data.recurringInvoices || []).map(mapRecurringInvoice);
  },

  async createRecurringInvoice(input: CreateRecurringInvoiceInput, options?: ApiOptions): Promise<RecurringInvoice> {
    const data = await request<{ recurringInvoice: any }>('/api/recurring-invoices', options, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return mapRecurringInvoice(data.recurringInvoice);
  },

  async updateRecurringInvoice(id: string, input: Partial<CreateRecurringInvoiceInput>, options?: ApiOptions): Promise<RecurringInvoice> {
    const data = await request<{ recurringInvoice: any }>(`/api/recurring-invoices/${id}`, options, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return mapRecurringInvoice(data.recurringInvoice);
  },

  async setRecurringInvoiceStatus(id: string, status: 'active' | 'paused' | 'cancelled', options?: ApiOptions): Promise<RecurringInvoice> {
    const data = await request<{ recurringInvoice: any }>(`/api/recurring-invoices/${id}/status`, options, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return mapRecurringInvoice(data.recurringInvoice);
  },

  async triggerRecurringInvoice(id: string, options?: ApiOptions): Promise<Invoice> {
    const data = await request<{ document: any }>(`/api/recurring-invoices/${id}/trigger`, options, { method: 'POST' });
    return mapBackendInvoice(data.document);
  },

  // ── Calendar ICS ────────────────────────────────────────────────────────────

  async calendarIcsToken(options?: ApiOptions): Promise<{ token: string; subscribeUrl: string }> {
    return request<{ token: string; subscribeUrl: string }>('/api/calendar/ics-token', options);
  },

  async createPaymentLinkDraft(prompt: string): Promise<PaymentLinkDraft> {
    await wait();
    return {
      id: 'draft_link_new',
      prompt,
      title: 'Prompt-created payment link',
      amountUsd: 750,
      asset: 'USDC',
      chain: 'Base',
      memo: 'Requested via AI composer'
    };
  }
};
