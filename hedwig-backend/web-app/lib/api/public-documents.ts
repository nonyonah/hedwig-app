import { backendConfig } from '@/lib/auth/config';

export interface PublicUsdAccount {
  bank_name?: string | null;
  account_number?: string | null;
  routing_number?: string | null;
  rail?: string;
  currency?: string;
}

export interface PublicBankAccountPayload {
  id?: string;
  country: 'NG' | 'US' | 'UK' | 'GH';
  currency: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string | null;
  routing_number: string | null;
  sort_code: string | null;
  iban: string | null;
  swift_bic: string | null;
  account_type: 'checking' | 'savings' | null;
  is_verified: boolean;
  is_default?: boolean;
}

export interface PublicInvoiceItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

export interface PublicDocument {
  id: string;
  type: string;
  title: string;
  amount: number;
  status: string;
  chain?: string | null;
  description?: string | null;
  currency?: string | null;
  created_at?: string;
  updated_at?: string;
  payment_link_url?: string | null;
  content?: {
    client_name?: string;
    client_email?: string;
    recipient_email?: string;
    due_date?: string;
    notes?: string;
    items?: PublicInvoiceItem[];
    blockradar_url?: string;
    generated_content?: string;
    approval_token?: string | null;
    milestones?: Array<{ title?: string; amount?: number | string; description?: string }>;
    payment_amount?: number | string;
    payment_terms?: string;
  };
  user?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    ethereum_wallet_address?: string;
    solana_wallet_address?: string;
    usd_account?: PublicUsdAccount;
    bank_account?: PublicBankAccountPayload;
    bank_accounts?: PublicBankAccountPayload[];
  };
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { message?: string } | string;
}

async function fetchDocumentFromPath(path: string): Promise<PublicDocument | null> {
  const response = await fetch(`${backendConfig.apiBaseUrl}${path}`, {
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();

  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from document endpoint but received ${contentType || 'unknown content type'}.`);
  }

  const payload = JSON.parse(rawBody) as ApiEnvelope<{ document: PublicDocument }>;

  if (!response.ok || !payload?.success) {
    const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
    throw new Error(message || 'Failed to fetch public document');
  }

  return payload.data?.document || null;
}

function hasMerchantWallets(document: PublicDocument | null) {
  return Boolean(
    document?.user?.ethereum_wallet_address ||
    document?.user?.solana_wallet_address
  );
}

export async function fetchPublicDocument(id: string): Promise<PublicDocument | null> {
  const publicDocument = await fetchDocumentFromPath(`/api/documents/${id}/public`);
  if (!publicDocument) {
    return null;
  }

  if (hasMerchantWallets(publicDocument)) {
    return publicDocument;
  }

  const fallbackDocument = await fetchDocumentFromPath(`/api/documents/${id}`);
  if (!fallbackDocument) {
    return publicDocument;
  }

  return {
    ...publicDocument,
    chain: publicDocument.chain ?? fallbackDocument.chain,
    user: {
      ...publicDocument.user,
      ...fallbackDocument.user,
      usd_account: publicDocument.user?.usd_account || fallbackDocument.user?.usd_account,
      bank_account: publicDocument.user?.bank_account || fallbackDocument.user?.bank_account,
      bank_accounts: publicDocument.user?.bank_accounts || fallbackDocument.user?.bank_accounts,
    }
  };
}
