'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  FileText,
  IdentificationCard,
  LinkSimple,
  MagnifyingGlass,
  Repeat,
  User,
  X,
} from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import { useCurrency } from '@/components/providers/currency-provider';
import type { Invoice, PaymentLink, Client, Contract, RecurringInvoice } from '@/lib/models/entities';
import { openPaymentDetail } from '@/lib/payments/open-detail';
import { ClientPortal } from '@/components/ui/client-portal';

type SearchResult =
  | { kind: 'invoice'; data: Invoice }
  | { kind: 'payment-link'; data: PaymentLink }
  | { kind: 'client'; data: Client }
  | { kind: 'contract'; data: Contract }
  | { kind: 'recurring'; data: RecurringInvoice };

type CachedData = {
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  clients: Client[];
  contracts: Contract[];
  recurring: RecurringInvoice[];
};

function scoreMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

function searchData(data: CachedData, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchResult[] = [];

  for (const inv of data.invoices) {
    if (
      scoreMatch(inv.title || '', q) ||
      scoreMatch(inv.number || '', q) ||
      scoreMatch(String(inv.amountUsd), q)
    ) {
      results.push({ kind: 'invoice', data: inv });
    }
  }
  for (const link of data.paymentLinks) {
    if (scoreMatch(link.title || '', q) || scoreMatch(String(link.amountUsd), q)) {
      results.push({ kind: 'payment-link', data: link });
    }
  }
  for (const client of data.clients) {
    if (
      scoreMatch(client.name || '', q) ||
      scoreMatch(client.email || '', q) ||
      scoreMatch(client.company || '', q)
    ) {
      results.push({ kind: 'client', data: client });
    }
  }
  for (const contract of data.contracts) {
    if (scoreMatch(contract.title || '', q)) {
      results.push({ kind: 'contract', data: contract });
    }
  }
  for (const r of data.recurring) {
    if (
      scoreMatch(r.title || '', q) ||
      scoreMatch(r.clientName || '', q) ||
      scoreMatch(r.clientEmail || '', q)
    ) {
      results.push({ kind: 'recurring', data: r });
    }
  }

  return results.slice(0, 12);
}

const KIND_META = {
  invoice: { label: 'Invoice', Icon: FileText, color: 'text-[#717680]', bg: 'bg-[#eff4ff]' },
  'payment-link': { label: 'Payment link', Icon: LinkSimple, color: 'text-[#717680]', bg: 'bg-[#f0fdf4]' },
  client: { label: 'Client', Icon: User, color: 'text-[#717680]', bg: 'bg-[#f2f4f7]' },
  contract: { label: 'Contract', Icon: IdentificationCard, color: 'text-[#717680]', bg: 'bg-[#fdf4ff]' },
  recurring: { label: 'Recurring', Icon: Repeat, color: 'text-[#717680]', bg: 'bg-[#fff7ed]' },
};

function getResultHref(result: SearchResult): string {
  if (result.kind === 'invoice') return `/payments?invoice=${result.data.id}`;
  if (result.kind === 'payment-link') return `/payments?paymentLink=${result.data.id}`;
  if (result.kind === 'client') return `/clients/${result.data.id}`;
  if (result.kind === 'contract') return `/contracts?contract=${result.data.id}`;
  return `/payments?recurring=${result.data.id}`;
}

function ResultRow({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const meta = KIND_META[result.kind];
  const Icon = meta.Icon;
  const { formatAmount } = useCurrency();

  let title = '';
  let subtitle = '';

  if (result.kind === 'invoice') {
    title = result.data.title || result.data.number;
    subtitle = `${result.data.number} · ${result.data.status} · ${formatAmount(result.data.amountUsd, { compact: true })}`;
  } else if (result.kind === 'payment-link') {
    title = result.data.title;
    subtitle = `${result.data.status} · ${formatAmount(result.data.amountUsd, { compact: true })}`;
  } else if (result.kind === 'client') {
    title = result.data.name;
    subtitle = result.data.email + (result.data.company ? ` · ${result.data.company}` : '');
  } else if (result.kind === 'contract') {
    title = result.data.title;
    subtitle = result.data.status;
  } else if (result.kind === 'recurring') {
    title = result.data.title || 'Recurring invoice';
    subtitle = `${result.data.frequency} · ${result.data.status} · ${formatAmount(result.data.amountUsd, { compact: true })}`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#fafafa]"
    >
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} weight="regular" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#181d27]">{title}</p>
        <p className="truncate text-[11px] text-[#a4a7ae]">{subtitle}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
        {meta.label}
      </span>
    </button>
  );
}

export function GlobalSearch({ accessToken }: { accessToken?: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cachedData, setCachedData] = useState<CachedData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch all data when palette opens
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 50);

    if (cachedData || !accessToken) return;
    setLoading(true);
    const opts = { accessToken };
    Promise.all([
      hedwigApi.payments(opts).catch(() => ({ invoices: [], paymentLinks: [] })),
      hedwigApi.clients(opts).catch(() => []),
      hedwigApi.contracts(opts).catch(() => []),
      hedwigApi.recurringInvoices(opts).catch(() => []),
    ]).then(([payments, clients, contracts, recurring]) => {
      setCachedData({
        invoices: (payments as any).invoices || [],
        paymentLinks: (payments as any).paymentLinks || [],
        clients: clients as Client[],
        contracts: contracts as Contract[],
        recurring: recurring as RecurringInvoice[],
      });
    }).finally(() => setLoading(false));
  }, [open, accessToken, cachedData]);

  // Filter on query change
  useEffect(() => {
    if (!cachedData || !query.trim()) {
      setResults([]);
      return;
    }
    setResults(searchData(cachedData, query));
  }, [query, cachedData]);

  const handleResultClick = (result: SearchResult) => {
    if (result.kind === 'invoice' || result.kind === 'payment-link' || result.kind === 'recurring') {
      openPaymentDetail(result.kind, result.data.id);
      setOpen(false);
      return;
    }

    const href = getResultHref(result);
    router.push(href);
    setOpen(false);
  };

  const handleOpenCreate = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('hedwig:open-create-menu'));
  };

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-[#eef0f3] bg-[#f8f9fb] px-3 py-1.5 text-[13px] text-[#98a2b3] transition-colors hover:border-[#e4e7ec] hover:bg-white"
      >
        <MagnifyingGlass className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-0.5 hidden rounded border border-[#eef0f3] px-1.5 py-0.5 text-[10px] font-semibold sm:inline">⌘K</kbd>
      </button>

      {/* Palette overlay */}
      {open && (
        <ClientPortal>
          <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh]">
          {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />

          {/* Dialog */}
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#eef0f3]">
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-4 py-3.5">
              <MagnifyingGlass className="h-4 w-4 shrink-0 text-[#a4a7ae]" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search invoices, clients, contracts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                    if (results.length > 0) {
                      handleResultClick(results[0]);
                      return;
                    }
                    handleOpenCreate();
                  }
                }}
                className="flex-1 bg-transparent text-[14px] text-[#181d27] placeholder-[#a4a7ae] outline-none"
              />
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#eef0f3] border-t-[#2563eb]" />
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-[#a4a7ae] transition-colors hover:bg-[#f4f5f7]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {query.trim() && results.length === 0 && !loading && (
                <div className="py-8 text-center text-[13px] text-[#a4a7ae]">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
              {!query.trim() && !loading && (
                <div className="py-6 text-center text-[13px] text-[#a4a7ae]">
                  Start typing to search across your invoices, clients, contracts, and more.
                </div>
              )}
              {results.map((result, i) => (
                <ResultRow
                  key={`${result.kind}-${i}`}
                  result={result}
                  onClick={() => handleResultClick(result)}
                />
              ))}
            </div>

            {/* Quick create footer */}
            <div className="border-t border-[#f2f4f7] p-1.5">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#eff4ff]"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eff4ff] transition-colors group-hover:bg-[#dbeafe]">
                  <ArrowRight className="h-3.5 w-3.5 text-[#717680]" weight="bold" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[13px] font-semibold text-[#717680]">
                    {query.trim() ? `Create from "${query}"` : 'Open structured create menu'}
                  </p>
                  <p className="text-[11px] text-[#717680]">Create invoices, payment links, clients, and projects.</p>
                </div>
              </button>
            </div>
            </div>
          </div>
        </ClientPortal>
      )}
    </>
  );
}
