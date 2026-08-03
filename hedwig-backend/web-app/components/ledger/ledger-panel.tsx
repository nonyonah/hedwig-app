'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarBlank,
  Check,
  DownloadSimple,
  GoogleSheetsLogo,
  MagnifyingGlass,
  Sparkle,
  X,
} from '@/components/ui/lucide-icons';
import { Loader } from '@/components/ui/loader';
import { Alert, Dropdown, Label } from '@heroui/react';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid, type AttachedStatCardItem } from '@/components/ui/attached-stat-cards';
import { hedwigApi } from '@/lib/api/client';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { formatShortDate } from '@/lib/utils';
import { FinancialEventDetailDialog } from '@/components/ledger/financial-event-detail-dialog';
import type { LedgerEntry, LedgerKind } from '@/lib/types/revenue';

const RANGES: { key: string; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '1y', label: 'Last 12 months' },
  { key: 'ytd', label: 'Year to date' },
];

const KINDS: { key: LedgerKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'withdrawals', label: 'Withdrawals' },
  { key: 'deposits', label: 'Deposits' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'imported', label: 'Imported' },
];

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

function kindLabel(entry: LedgerEntry): string {
  const et = entry.event_type || '';
  if (et.startsWith('imported_transaction.')) return 'Imported';
  if (et === 'offramp.settled') return 'Withdrawal';
  if (et === 'offramp.refunded') return 'Refund';
  if (et === 'wallet.deposit.received') return 'Deposit';
  if (entry.type === 'expense') return 'Expense';
  if (entry.type === 'revenue') return 'Payment';
  if (entry.type === 'credit') return 'Other income';
  if (entry.type === 'transfer' && entry.credit > 0) return 'Imported credit';
  return 'Transfer';
}

function statusMeta(status: string | null | undefined): { label: string; cls: string } | null {
  switch (status) {
    case 'matched':
    case 'expensed':
      return { label: 'Matched', cls: 'bg-[var(--color-success-soft)] text-[var(--color-success)]' };
    case 'pending':
    case 'reviewing':
      return { label: status === 'reviewing' ? 'Reviewing' : 'Pending', cls: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' };
    case 'skipped':
      return { label: 'Skipped', cls: 'bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]' };
    default:
      return null;
  }
}

function MovementBox({ title, items, tone, Icon, formatAmount }: {
  title: string;
  items: { account: string; amount: number }[];
  tone: 'success' | 'danger';
  Icon: any;
  formatAmount: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  const total = items.reduce((s, i) => s + i.amount, 0);
  const color = tone === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-danger)]';
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-text-tertiary)]">
          <Icon className={`h-3.5 w-3.5 ${tone === 'success' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`} weight="bold" />
          {title}
        </p>
        {items.length > 0 && (
          <p className="text-[12px] font-semibold tabular-nums text-[var(--color-foreground)]">
            {formatAmount(total)}
          </p>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {items.length === 0 && <p className="text-[12px] text-[var(--color-text-muted)]">No movement this period.</p>}
        {items.map((item) => (
          <div key={item.account}>
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[13px] text-[var(--color-text-secondary)]">{item.account}</p>
              <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">${item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, (item.amount / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LedgerPanel({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const [range, setRange] = useState('30d');
  const [kind, setKind] = useState<LedgerKind>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    entries: LedgerEntry[];
    summary: {
      moneyIn: number; moneyOut: number; net: number; entryCount: number;
      movement: { in: { account: string; amount: number }[]; out: { account: string; amount: number }[] };
    };
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  } | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [exportingToSheets, setExportingToSheets] = useState(false);
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const checkSheetsConnection = useCallback(async () => {
    try {
      const payload = await fetch('/api/integrations/composio/status', { cache: 'no-store' }).then((r) => r.json());
      if (payload.success) {
        const gs = (payload.data.connections ?? []).find((c: any) => c.provider === 'google_sheets');
        setSheetsConnected(gs?.status === 'active');
      }
    } catch {}
  }, []);

  useEffect(() => {
    void checkSheetsConnection();
    window.addEventListener('focus', checkSheetsConnection);
    return () => window.removeEventListener('focus', checkSheetsConnection);
  }, [checkSheetsConnection]);

  // Debounced search — resets to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(() => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    const params: { range: string; kind: string; q: string; page: number; pageSize: number } = {
      range, kind, q, page, pageSize: 50,
    };
    Promise.all([
      hedwigApi.ledger(params, { accessToken }),
      hedwigApi.ledgerNarrative(range, { accessToken }),
    ])
      .then(([ledger, narr]) => {
        setData(ledger as any);
        setNarrative((narr as any).narrative || null);
      })
      .catch(() => {
        setData((prev) => prev);
        setError('Could not load ledger. Check your connection.');
      })
      .finally(() => setLoading(false));
  }, [accessToken, range, kind, q, page]);

  useEffect(() => { load(); }, [load]);

  const handleExportXlsx = async () => {
    if (!accessToken) return;
    try {
      const blob = await hedwigApi.ledgerExportBlob(range, { accessToken });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hedwig-ledger-${range}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ type: 'success', title: 'Exported', message: 'Ledger export downloaded.' });
    } catch {
      toast({ type: 'error', title: 'Export failed', message: 'Could not generate XLSX export.' });
    }
  };

  const handleExportSheets = async () => {
    if (!accessToken) return;
    setExportingToSheets(true);
    try {
      const result = await hedwigApi.exportToGoogleSheets(range, { accessToken });
      if (result.needsConnection && result.redirectUrl) {
        window.open(result.redirectUrl, '_blank');
        toast({ type: 'info', title: 'Connect Google Sheets', message: 'Complete the OAuth flow in the new tab, then try exporting again.' });
      } else if (result.spreadsheetUrl) {
        window.open(result.spreadsheetUrl, '_blank');
        toast({ type: 'success', title: 'Exported to Sheets', message: 'Ledger data has been pushed to Google Sheets.' });
      }
    } catch {
      toast({ type: 'error', title: 'Export failed', message: 'Could not export to Google Sheets. Check your connection.' });
    } finally {
      setExportingToSheets(false);
      void checkSheetsConnection();
    }
  };

  const displayNarrative = narrative ? stripMarkdown(narrative) : null;

  const statCards: AttachedStatCardItem[] = data ? [
    {
      id: 'money-in',
      title: 'Money in',
      value: formatAmount(data.summary.moneyIn),
      helper: `${data.pagination.total.toLocaleString()} events match your filters`,
      icon: ArrowUp,
      iconClassName: 'text-[var(--color-success)]',
      iconWrapClassName: 'bg-[var(--color-success-soft)]',
    },
    {
      id: 'money-out',
      title: 'Money out',
      value: formatAmount(data.summary.moneyOut),
      icon: ArrowDown,
      iconClassName: 'text-[var(--color-danger)]',
      iconWrapClassName: 'bg-[var(--color-danger-soft)]',
    },
    {
      id: 'net',
      title: 'Net',
      value: formatAmount(data.summary.net),
      icon: data.summary.net >= 0 ? ArrowUp : ArrowDown,
      iconClassName: data.summary.net >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
      iconWrapClassName: data.summary.net >= 0 ? 'bg-[var(--color-success-soft)]' : 'bg-[var(--color-danger-soft)]',
      helper: 'money in minus money out',
    },
  ] : [];

  const selectedRangeLabel = RANGES.find((r) => r.key === range)?.label ?? 'Last 30 days';

  return (
    <div className="space-y-4">
      {displayNarrative && (
        <Alert status="accent">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description className="flex items-start gap-2">
              <Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" weight="bold" />
              <span>{displayNarrative}</span>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* Money movement strip */}
      <AttachedStatGrid items={statCards} className="grid-cols-1 md:grid-cols-3" />

      {(data?.summary.movement.in.length || 0) + (data?.summary.movement.out.length || 0) > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MovementBox title="Money in by account" items={data?.summary.movement.in || []} tone="success" Icon={ArrowUp} formatAmount={formatAmount} />
          <MovementBox title="Money out by account" items={data?.summary.movement.out || []} tone="danger" Icon={ArrowDown} formatAmount={formatAmount} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {KINDS.map((k) => (
              <Button
                key={k.key}
                variant="ghost"
                size="sm"
                onClick={() => { setKind(k.key); setPage(1); }}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium ${
                  kind === k.key
                    ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {k.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search events"
                aria-label="Search ledger events"
                className="h-8 w-[200px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-7 text-[12px] text-[var(--color-foreground)] placeholder:text-[var(--color-text-placeholder)] transition focus:border-[var(--color-primary)] focus:outline-none sm:w-[220px]"
              />
              {qInput && (
                <button
                  type="button"
                  onClick={() => setQInput('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-tertiary)] transition hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Dropdown>
              <Dropdown.Trigger>
                <span>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <CalendarBlank className="h-3.5 w-3.5" weight="bold" />
                    {selectedRangeLabel}
                  </Button>
                </span>
              </Dropdown.Trigger>
              <Dropdown.Popover>
                <Dropdown.Menu onAction={(key) => { setRange(String(key)); setPage(1); }}>
                  {RANGES.map((r) => (
                    <Dropdown.Item key={r.key} textValue={r.label}>
                      {range === r.key && <Check className="h-3.5 w-3.5 text-[var(--color-success)]" weight="bold" />}
                      <Label>{r.label}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <Dropdown>
              <Dropdown.Trigger>
                <span>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    {loading ? <Loader size={14} /> : <DownloadSimple className="h-3.5 w-3.5" weight="bold" />}
                    Export
                    {sheetsConnected && <span className="ml-1 h-2 w-2 rounded-full bg-[var(--color-success)]" />}
                  </Button>
                </span>
              </Dropdown.Trigger>
              <Dropdown.Popover>
                <Dropdown.Menu onAction={(key) => {
                  if (key === 'device') void handleExportXlsx();
                  if (key === 'sheets') void handleExportSheets();
                }}>
                  <Dropdown.Item id="device" textValue="Export to device">
                    <DownloadSimple className="h-3.5 w-3.5 text-[var(--color-text-placeholder)]" weight="bold" />
                    <Label>Export to Device</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="sheets" textValue={sheetsConnected ? 'Export to Google Sheets' : 'Connect Google Sheets'}>
                    {exportingToSheets ? <Loader size={14} /> : (
                      sheetsConnected
                        ? <Check size={14} className="text-[var(--color-success)]" weight="fill" />
                        : <GoogleSheetsLogo size={14} className="text-[var(--color-text-placeholder)]" />
                    )}
                    <Label>{sheetsConnected ? 'Export to Google Sheets' : 'Connect Google Sheets'}</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            {data ? `${data.pagination.total.toLocaleString()} ${data.pagination.total === 1 ? 'event' : 'events'}` : '—'}
          </span>
        </div>
      </div>

      {/* Ledger table */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="px-5 py-3 text-[11px] font-medium text-[var(--color-text-tertiary)]">Date</th>
                <th className="px-5 py-3 text-[11px] font-medium text-[var(--color-text-tertiary)]">Description</th>
                <th className="hidden px-5 py-3 text-[11px] font-medium text-[var(--color-text-tertiary)] md:table-cell">Account</th>
                <th className="hidden px-5 py-3 text-[11px] font-medium text-[var(--color-text-tertiary)] lg:table-cell">Status</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
              {loading && !data ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16">
                    <div className="flex items-center justify-center gap-3">
                      <Loader size={18} />
                      <span className="text-[12px] text-[var(--color-text-muted)]">Loading ledger…</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <p className="text-[13px] text-[var(--color-text-muted)]">{error}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => load()}>Try again</Button>
                  </td>
                </tr>
              ) : data && data.entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center">
                    <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">No events match your filters</p>
                    <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">Try a longer time range or clear the search.</p>
                    {(kind !== 'all' || q) && (
                      <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setKind('all'); setQInput(''); setQ(''); setPage(1); }}>
                        Reset filters
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (data?.entries || []).map((entry) => {
                const isIn = entry.credit > 0;
                const amount = entry.credit > 0 ? entry.credit : entry.debit;
                const status = statusMeta(entry.status);
                return (
                  <tr
                    key={`${entry.referenceId}-${entry.type}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`View details for ${entry.description}`}
                    onClick={() => setSelected(entry)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(entry); }
                    }}
                    className="cursor-pointer transition-colors hover:bg-[var(--color-background)] focus-visible:bg-[var(--color-background)] focus-visible:outline-none"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-[12px] tabular-nums text-[var(--color-text-muted)]">{formatShortDate(entry.date)}</td>
                    <td className="max-w-[240px] px-5 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          isIn ? 'bg-[var(--color-success-soft)]' : 'bg-[var(--color-danger-soft)]'
                        }`}>
                          {isIn
                            ? <ArrowUp className={`h-3 w-3 ${isIn ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`} weight="bold" />
                            : <ArrowDown className={`h-3 w-3 ${isIn ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`} weight="bold" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]" title={entry.description}>{entry.description}</p>
                          <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">{kindLabel(entry)}{entry.category ? ` · ${entry.category}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 text-[12px] text-[var(--color-text-muted)] md:table-cell">{entry.account}</td>
                    <td className="hidden px-5 py-3 lg:table-cell">
                      {status ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
                      ) : (
                        <span className="text-[12px] text-[var(--color-text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right text-[13px] font-semibold tabular-nums ${isIn ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {isIn ? '+' : '−'}{formatAmount(amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} events)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-background)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page >= data.pagination.totalPages}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-background)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <FinancialEventDetailDialog
        entry={selected}
        open={selected !== null}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        accessToken={accessToken}
      />
    </div>
  );
}