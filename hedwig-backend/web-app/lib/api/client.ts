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
  WalletTransaction
} from '@/lib/models/entities';

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

const normalizeWalletTransactionKind = (value?: string | null): WalletTransaction['kind'] => {
  const kind = String(value || '').toLowerCase();
  if (kind.includes('receive') || kind === 'in' || kind.includes('received')) return 'receive';
  if (kind.includes('settlement')) return 'settlement';
  if (kind.includes('payment')) return 'payment';
  return 'send';
};

const mapBackendUser = (user: any): User => ({
  id: String(user?.id ?? currentUser.id),
  privyId: String(user?.privyId ?? user?.privy_id ?? currentUser.privyId),
  workspaceId: workspace.id,
  email: String(user?.email ?? currentUser.email),
  firstName: String(user?.firstName ?? user?.first_name ?? currentUser.firstName),
  lastName: String(user?.lastName ?? user?.last_name ?? currentUser.lastName),
  role: 'owner',
  avatarUrl: user?.avatar ?? user?.avatarUrl ?? undefined
});

const mapBackendClient = (client: any): Client => ({
  id: String(client.id),
  workspaceId: workspace.id,
  name: String(client.name || 'Unnamed client'),
  company: client.company || undefined,
  email: String(client.email || 'unknown@client.com'),
  status: normalizeClientStatus(client.status),
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
  ownerName: currentUser.firstName + ' ' + currentUser.lastName
});

const mapBackendNotification = (notification: any): Notification => ({
  id: String(notification.id),
  type: normalizeNotificationType(notification.type),
  title: String(notification.title || 'Notification'),
  body: String(notification.message || notification.body || ''),
  createdAt: String(notification.created_at || notification.createdAt || new Date().toISOString()),
  read: Boolean(notification.is_read ?? notification.read ?? false)
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

const mapBackendUsdAccount = (details: any): UsdAccount => ({
  id: String(details.bridgeVirtualAccountId || details.bridgeCustomerId || mockUsdAccount.id),
  provider: 'Bridge',
  status: normalizeUsdStatus(details.accountStatus),
  bankName: details.ach?.bankName || undefined,
  accountNumberMasked: details.ach?.accountNumberMasked || undefined,
  routingNumberMasked: details.ach?.routingNumberMasked || undefined,
  balanceUsd: 0,
  settlementChain: String(details.settlement?.chain || 'BASE').toUpperCase() === 'SOLANA' ? 'Solana' : 'Base'
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
  createdAt: String(order.createdAt || new Date().toISOString())
});

const shouldUseMockFallback = (options?: ApiOptions) => {
  if (options?.disableMockFallback) return false;
  return backendConfig.useMockData || !options?.accessToken;
};

const authHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'x-hedwig-shared-backend': backendConfig.apiBaseUrl
});

async function request<T>(path: string, options?: ApiOptions, init?: RequestInit): Promise<T> {
  if (!options?.accessToken) {
    throw new Error(`Missing access token for ${path}`);
  }

  const response = await fetch(`${backendConfig.apiBaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...authHeaders(options.accessToken),
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload?.success) {
    const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
    throw new Error(message || `Request failed for ${path}`);
  }

  return payload.data;
}

async function withFallback<T>(loader: () => Promise<T>, fallback: () => T | Promise<T>, options?: ApiOptions): Promise<T> {
  if (shouldUseMockFallback(options)) {
    await wait();
    return fallback();
  }

  try {
    return await loader();
  } catch {
    if (options?.disableMockFallback) throw new Error('Backend request failed and mock fallback is disabled');
    await wait();
    return fallback();
  }
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
        const [clientsData, projectsData, walletData, accountsData, notificationsData, shellData] = await Promise.all([
          this.clients(options),
          this.projects(options),
          this.wallet(options),
          this.accounts(options),
          this.notifications(options),
          this.shell(options)
        ]);

        const reminders = projectsData
          .filter((project) => project.nextDeadlineAt)
          .slice(0, 3)
          .map((project) => ({
            id: `project-${project.id}`,
            kind: 'deadline' as const,
            title: `${project.name} deadline approaching`,
            dueAt: project.nextDeadlineAt
          }));

        const outstandingUsd = clientsData.reduce((sum, client) => sum + client.outstandingUsd, 0);
        const inflowUsd = mockInvoices.filter((invoice) => invoice.status !== 'paid').reduce((sum, invoice) => sum + invoice.amountUsd, 0);

        return {
          totals: {
            inflowUsd,
            outstandingUsd,
            walletUsd: walletData.walletAssets.reduce((sum, asset) => sum + asset.valueUsd, 0),
            usdAccountUsd: accountsData.usdAccount.balanceUsd
          },
          reminders,
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
          invoices: mockInvoices,
          paymentLinks: mockPaymentLinks,
          projects: projectsData,
          milestones: mockMilestones
        };
      },
      () => ({
        totals: {
          inflowUsd: 21450,
          outstandingUsd: 5900,
          walletUsd: mockWalletAssets.reduce((sum, asset) => sum + asset.valueUsd, 0),
          usdAccountUsd: mockUsdAccount.balanceUsd
        },
        reminders: mockReminders,
        notifications: mockNotifications,
        activities: mockActivities,
        invoices: mockInvoices,
        paymentLinks: mockPaymentLinks,
        projects: mockProjects,
        milestones: mockMilestones
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

  async client(id: string, options?: ApiOptions) {
    return withFallback(
      async () => {
        const [clientData, projectsData] = await Promise.all([
          request<{ client: any }>(`/api/clients/${id}`, options),
          this.projects(options)
        ]);
        const client = mapBackendClient(clientData.client);

        return {
          client,
          projects: projectsData.filter((project) => project.clientId === id),
          invoices: mockInvoices.filter((item) => item.clientId === id),
          paymentLinks: mockPaymentLinks.filter((item) => item.clientId === id),
          contracts: mockContracts.filter((item) => item.clientId === id)
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

  async project(id: string, options?: ApiOptions) {
    return withFallback(
      async () => {
        const data = await request<{ project: any }>(`/api/projects/${id}`, options);
        const project = mapBackendProject(data.project);
        const milestones = (data.project?.milestones || []).map((milestone: any) => ({
          id: String(milestone.id),
          projectId: String(id),
          name: String(milestone.title || 'Milestone'),
          dueAt: String(milestone.dueDate || new Date().toISOString()),
          status: String(milestone.status || 'upcoming').toLowerCase() === 'paid'
            ? 'done'
            : String(milestone.status || '').toLowerCase() === 'late'
              ? 'late'
              : String(milestone.status || '').toLowerCase() === 'due_soon'
                ? 'due_soon'
                : 'upcoming',
          amountUsd: Number(milestone.amount || 0)
        }));

        return {
          project,
          milestones,
          invoices: mockInvoices.filter((invoice) => invoice.projectId === id)
        };
      },
      () => ({
        project: mockProjects.find((item) => item.id === id) ?? null,
        milestones: mockMilestones.filter((item) => item.projectId === id),
        invoices: mockInvoices.filter((item) => item.projectId === id)
      }),
      options
    );
  },

  async payments(_options?: ApiOptions) {
    await wait();
    return {
      invoices: mockInvoices,
      paymentLinks: mockPaymentLinks,
      invoiceDrafts,
      paymentLinkDrafts
    };
  },

  async contracts(_options?: ApiOptions): Promise<Contract[]> {
    await wait();
    return mockContracts;
  },

  async wallet(options?: ApiOptions): Promise<{ walletAccounts: WalletAccount[]; walletAssets: WalletAsset[]; walletTransactions: WalletTransaction[] }> {
    return withFallback(
      async () => {
        const transactions = await request<any[]>('/api/transactions', options);
        return {
          walletAccounts: mockWalletAccounts,
          walletAssets: mockWalletAssets,
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
        const [details, transfers] = await Promise.all([
          request<any>('/api/usd-accounts/details', options),
          request<{ transfers: any[] }>('/api/usd-accounts/transfers', options)
        ]);

        return {
          usdAccount: mapBackendUsdAccount(details),
          accountTransactions: (transfers.transfers || []).map(mapBackendUsdTransfer)
        };
      },
      () => ({
        usdAccount: mockUsdAccount,
        accountTransactions: mockAccountTransactions
      }),
      options
    );
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

  async calendar(_options?: ApiOptions) {
    await wait();
    return { reminders: mockReminders, milestones: mockMilestones, invoices: mockInvoices, projects: mockProjects };
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
