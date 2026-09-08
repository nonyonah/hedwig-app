'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowsLeftRight,
  Bank,
  Cards,
  Faders,
  FileText,
  FolderSimple,
  House,
  IdentificationCard,
  LinkSimple,
  MagnifyingGlass,
  Repeat,
  Sparkle,
  User,
  UsersThree,
  Wallet,
  X,
} from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import { useCurrency } from '@/components/providers/currency-provider';
import type { Invoice, PaymentLink, Client, Contract, RecurringInvoice, Project } from '@/lib/models/entities';
import type { LedgerEntry } from '@/lib/types/revenue';
import { openPaymentDetail } from '@/lib/payments/open-detail';
import { ClientPortal } from '@/components/ui/client-portal';
import { FinancialEventDetailDialog } from '@/components/ledger/financial-event-detail-dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

type SearchResult =
  | { kind: 'invoice'; data: Invoice }
  | { kind: 'payment-link'; data: PaymentLink }
  | { kind: 'client'; data: Client }
  | { kind: 'contract'; data: Contract }
  | { kind: 'recurring'; data: RecurringInvoice }
  | { kind: 'project'; data: Project }
  | { kind: 'transaction'; data: LedgerEntry }
  | { kind: 'statement'; data: Record<string, unknown> };

type CachedData = {
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  clients: Client[];
  contracts: Contract[];
  recurring: RecurringInvoice[];
  projects: Project[];
  transactions: LedgerEntry[];
  statements: Record<string, unknown>[];
};

// Quick navigation suggestions shown when the query is empty (reference:
// shadcn command demo). These are Hedwig's core destinations.
const SUGGESTIONS: Array<{ label: string; hint: string; href: string; Icon: typeof House }> = [
  { label: 'Accounts', hint: 'Balances & virtual accounts', href: '/accounts', Icon: Wallet },
  { label: 'Payments', hint: 'Invoices & payment links', href: '/payments', Icon: Cards },
  { label: 'Transactions', hint: 'Ledger & statements', href: '/revenue/transactions', Icon: ArrowsLeftRight },
  { label: 'Agents', hint: 'Delegated spend', href: '/agents', Icon: UsersThree },
  { label: 'Insights', hint: 'Briefs & analytics', href: '/insights', Icon: Sparkle },
  { label: 'Settings', hint: 'Workspace & preferences', href: '/settings', Icon: Faders },
];

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
  for (const p of data.projects) {
    if (
      scoreMatch(p.name || '', q) ||
      scoreMatch(p.ownerName || '', q) ||
      scoreMatch(String(p.budgetUsd), q)
    ) {
      results.push({ kind: 'project', data: p });
    }
  }
  for (const t of data.transactions) {
    if (
      scoreMatch(t.description || '', q) ||
      scoreMatch(t.account || '', q) ||
      scoreMatch(t.category || '', q) ||
      scoreMatch(String(t.debit ?? t.credit ?? ''), q)
    ) {
      results.push({ kind: 'transaction', data: t });
    }
  }
  for (const s of data.statements) {
    const name = String(s.file_name ?? s.name ?? s.id ?? '');
    if (scoreMatch(name, q)) {
      results.push({ kind: 'statement', data: s });
    }
  }

  return results.slice(0, 12);
}

const KIND_META = {
  invoice: { label: 'Invoices', Icon: FileText, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-accent-soft)]' },
  'payment-link': { label: 'Payment links', Icon: LinkSimple, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-success-soft)]' },
  client: { label: 'Clients', Icon: User, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-surface-tertiary)]' },
  contract: { label: 'Contracts', Icon: IdentificationCard, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-accent-soft)]' },
  recurring: { label: 'Recurring', Icon: Repeat, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-warning-soft)]' },
  project: { label: 'Projects', Icon: FolderSimple, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-accent-soft)]' },
  transaction: { label: 'Transactions', Icon: ArrowsLeftRight, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-success-soft)]' },
  statement: { label: 'Statements', Icon: Bank, color: 'text-[var(--color-text-tertiary)]', bg: 'bg-[var(--color-surface-tertiary)]' },
};

function getResultHref(result: SearchResult): string {
  if (result.kind === 'invoice') return `/payments?invoice=${result.data.id}`;
  if (result.kind === 'payment-link') return `/payments?paymentLink=${result.data.id}`;
  if (result.kind === 'client') return `/clients/${result.data.id}`;
  if (result.kind === 'contract') return `/contracts?contract=${result.data.id}`;
  if (result.kind === 'project') return `/projects/${result.data.id}`;
  if (result.kind === 'transaction') return `/revenue/transactions`;
  if (result.kind === 'statement') return `/revenue/transactions`;
  return `/payments?recurring=${result.data.id}`;
}

function resultTitle(result: SearchResult): string {
  if (result.kind === 'invoice') return result.data.title || result.data.number;
  if (result.kind === 'payment-link') return result.data.title;
  if (result.kind === 'client') return result.data.name;
  if (result.kind === 'project') return result.data.name;
  if (result.kind === 'contract') return result.data.title;
  if (result.kind === 'transaction') return result.data.description;
  if (result.kind === 'statement')
    return String(result.data.file_name ?? result.data.name ?? 'Statement');
  return result.data.title || 'Recurring invoice';
}

function ResultRowContent({ result }: { result: SearchResult }) {
  const meta = KIND_META[result.kind];
  const Icon = meta.Icon;
  const { formatAmount } = useCurrency();

  let subtitle = '';
  if (result.kind === 'invoice') {
    subtitle = `${result.data.number} · ${result.data.status} · ${formatAmount(result.data.amountUsd, { compact: true })}`;
  } else if (result.kind === 'payment-link') {
    subtitle = `${result.data.status} · ${formatAmount(result.data.amountUsd, { compact: true })}`;
  } else if (result.kind === 'client') {
    subtitle = result.data.email + (result.data.company ? ` · ${result.data.company}` : '');
  } else if (result.kind === 'project') {
    subtitle = `${result.data.status} · ${result.data.ownerName}`;
  } else if (result.kind === 'contract') {
    subtitle = result.data.status;
  } else if (result.kind === 'recurring') {
    subtitle = `${result.data.frequency} · ${result.data.status} · ${formatAmount(result.data.amountUsd, { compact: true })}`;
  } else if (result.kind === 'transaction') {
    const amount = Number(result.data.debit ?? result.data.credit ?? 0);
    subtitle = `${result.data.account} · ${formatAmount(amount, { compact: true })}`;
  } else if (result.kind === 'statement') {
    subtitle = String(result.data.status ?? result.data.created_at ?? 'import');
  }

  return (
    <>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} weight="regular" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">{resultTitle(result)}</p>
        <p className="truncate text-[11px] text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
        {meta.label}
      </span>
    </>
  );
}

function resultSubtitle(result: SearchResult): string {
  if (result.kind === 'invoice') return `${result.data.number} ${result.data.status}`;
  if (result.kind === 'payment-link') return result.data.status;
  if (result.kind === 'client') return `${result.data.name} ${result.data.email}`;
  if (result.kind === 'project') return result.data.name;
  if (result.kind === 'contract') return result.data.title;
  if (result.kind === 'transaction') return `${result.data.description} ${result.data.account}`;
  if (result.kind === 'statement')
    return String(result.data.file_name ?? result.data.name ?? 'statement');
  return result.data.title || 'recurring';
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
      hedwigApi.projects(opts).catch(() => []),
      hedwigApi.ledger({ pageSize: 50, range: '90d' }, opts).catch(() => ({ entries: [] })),
      hedwigApi.statementImports(opts).catch(() => []),
    ]).then(([payments, clients, contracts, recurring, projects, ledger, statements]) => {
      setCachedData({
        invoices: (payments as any).invoices || [],
        paymentLinks: (payments as any).paymentLinks || [],
        clients: clients as Client[],
        contracts: contracts as Contract[],
        recurring: recurring as RecurringInvoice[],
        projects: projects as Project[],
        transactions: ((ledger as { entries?: LedgerEntry[] }).entries || []) as LedgerEntry[],
        statements: (statements || []) as Record<string, unknown>[],
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

  // Group results by kind for cmdk sections, preserving match order.
  const grouped = (() => {
    const order: SearchResult['kind'][] = [];
    const byKind = new Map<SearchResult['kind'], SearchResult[]>();
    for (const r of results) {
      if (!byKind.has(r.kind)) {
        byKind.set(r.kind, []);
        order.push(r.kind);
      }
      byKind.get(r.kind)!.push(r);
    }
    return order.map((kind) => ({ kind, items: byKind.get(kind)! }));
  })();

  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);

  const handleResultClick = (result: SearchResult) => {
    if (result.kind === 'invoice' || result.kind === 'payment-link' || result.kind === 'recurring') {
      openPaymentDetail(result.kind, result.data.id);
      setOpen(false);
      return;
    }
    if (result.kind === 'transaction') {
      setDetailEntry(result.data);
      setOpen(false);
      return;
    }

    const href = getResultHref(result);
    router.push(href);
    setOpen(false);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-[var(--color-border-light)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-[13px] text-[var(--color-text-placeholder)] transition-colors hover:border-[var(--color-border-input)] hover:bg-[var(--color-surface)]"
      >
        <MagnifyingGlass className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-0.5 hidden rounded border border-[var(--color-border-light)] px-1.5 py-0.5 text-[10px] font-semibold sm:inline">⌘K</kbd>
      </button>

      {/* Palette overlay */}
      {open && (
        <ClientPortal>
          <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh]">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />

            {/* Command palette */}
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl">
              <Command
                shouldFilter={false}
                className="rounded-2xl"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-[var(--color-border-light)] px-4 py-0.5">
                  <CommandInput
                    ref={inputRef as never}
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Type a command or search…"
                    wrapperClassName="border-b-0 px-0"
                    className="h-12 min-w-0 flex-1 border-0"
                  />
                  {loading && (
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-border-light)] border-t-[var(--color-accent)]" />
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="shrink-0 rounded-full p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <CommandList>
                  <CommandEmpty>
                    {query.trim()
                      ? `No results for "${query}"`
                      : 'Start typing to search across Hedwig.'}
                  </CommandEmpty>
                  {!query.trim() && (
                    <CommandGroup heading="Suggestions">
                      {SUGGESTIONS.map((s) => (
                        <CommandItem
                          key={s.href}
                          value={s.label}
                          onSelect={() => {
                            router.push(s.href);
                            setOpen(false);
                          }}
                          className="gap-3 px-3 py-2.5"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-tertiary)]">
                            <s.Icon className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" weight="regular" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">{s.label}</p>
                            <p className="truncate text-[11px] text-[var(--color-text-muted)]">{s.hint}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {grouped.map((group) => (
                    <CommandGroup key={group.kind} heading={KIND_META[group.kind].label}>
                      {group.items.map((result) => (
                        <CommandItem
                          key={`${result.kind}-${result.data.id}`}
                          value={`${result.kind} ${resultTitle(result)} ${resultSubtitle(result)}`}
                          onSelect={() => handleResultClick(result)}
                          className="gap-3 px-3 py-2.5"
                        >
                          <ResultRowContent result={result} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </div>
          </div>
        </ClientPortal>
      )}

      <FinancialEventDetailDialog
        entry={detailEntry}
        open={detailEntry !== null}
        onOpenChange={(o) => !o && setDetailEntry(null)}
        accessToken={accessToken}
      />
    </>
  );
}
