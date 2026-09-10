'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CaretDown, CurrencyDollar, MagnifyingGlass, X } from '@/components/ui/lucide-icons';
import { Button as HButton, Checkbox, Dropdown, Pagination, Table, type Selection } from '@heroui/react';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { Modal, ModalClose, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { TransactionDetailPanel } from '@/components/ledger/transaction-detail-panel';
import { ImportDialog } from '../revenue/import-dialog';
import { UploadSimple } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { useToast } from '@/components/providers/toast-provider';
import type { LedgerEntry } from '@/lib/types/revenue';

const PAGE_SIZE = 25;

type KindFilter = 'all' | 'income' | 'expenses' | 'withdrawals' | 'deposits';

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'deposits', label: 'Deposits' },
];

const RANGES = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '1y', label: '1Y' },
] as const;

type Suggestion = {
  transactionId: string;
  invoiceId: string;
  score: number;
  reasons: string[];
  transactionLabel?: string;
  invoiceLabel?: string;
  amount?: number;
};

const fullUsd = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toFrom(e: LedgerEntry): { from: string; to: string; out: boolean } {
  const debit = Number(e.debit ?? 0);
  const out = debit > 0;
  return out
    ? { from: e.account || 'Account', to: e.description || 'Unknown', out }
    : { from: e.description || 'Unknown', to: e.account || 'Account', out };
}

export function TransactionsView({
  accessToken,
  workspaceId,
  initialEntries,
  initialSummary,
  initialRange,
  initialCategories,
}: {
  accessToken: string | null;
  workspaceId?: string | null;
  initialEntries: LedgerEntry[];
  initialSummary: { moneyIn: number; moneyOut: number; net: number };
  initialRange: string;
  initialCategories: string[];
}) {
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const [entries, setEntries] = useState<LedgerEntry[]>(initialEntries);
  const [summary, setSummary] = useState(initialSummary);
  const [range, setRange] = useState(initialRange);
  const [kind, setKind] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [matchFor, setMatchFor] = useState<LedgerEntry | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [newCategoryFor, setNewCategoryFor] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [newCategoryValue, setNewCategoryValue] = useState('');

  useAssistantPageContext('Transactions', {
    range,
    entriesCount: entries.length,
    moneyIn: summary.moneyIn,
    moneyOut: summary.moneyOut,
  });

  const opts = { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true };

  const refresh = async (r: string = range, k: KindFilter = kind, q: string = debouncedSearch) => {
    if (!accessToken) return;
    setIsRefreshing(true);
    try {
      const res = await hedwigApi.ledger({ range: r, kind: k, q: q || undefined, pageSize: 500 }, opts);
      setEntries(((res.entries ?? []) as unknown) as LedgerEntry[]);
      setSummary({
        moneyIn: res.summary?.moneyIn ?? 0,
        moneyOut: res.summary?.moneyOut ?? 0,
        net: res.summary?.net ?? 0,
      });
    } catch {
      // Keep current rows on failure.
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
    void refresh(range, kind, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, kind, debouncedSearch]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [kind, debouncedSearch]);

  const refreshCategories = async () => {
    if (!accessToken) return;
    try {
      const res = await hedwigApi.transactionCategories(opts);
      if (Array.isArray(res.categories) && res.categories.length > 0) setCategories(res.categories);
    } catch {
      // keep existing list
    }
  };

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, page]);

  const isImportedUnmatched = (e: LedgerEntry) =>
    (e.event_type ?? '').startsWith('imported_transaction.') &&
    (e.status === 'pending' || e.status === 'reviewing' || !e.status);

  const openMatchDialog = async (entry: LedgerEntry) => {
    setMatchFor(entry);
    setSuggestions([]);
    setSuggestionsLoading(true);
    try {
      const res = await hedwigApi.autoMatchImportedTransactions({ minScore: 0.3 }, opts);
      setSuggestions(
        ((res.suggestions ?? []) as Suggestion[]).filter((s) => s.transactionId === entry.referenceId)
      );
    } catch {
      toast({ type: 'error', title: 'Match failed', message: 'Could not load suggestions.' });
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const applySuggestion = async (s: Suggestion) => {
    setApplyingId(s.transactionId);
    try {
      await hedwigApi.matchImportedTransaction(
        s.transactionId,
        { matchedInvoiceId: s.invoiceId, matchMethod: 'manual', status: 'matched' },
        opts
      );
      toast({ type: 'success', title: 'Matched', message: 'Receipt linked to invoice.' });
      setMatchFor(null);
      await refresh();
    } catch (err: unknown) {
      toast({ type: 'error', title: 'Match failed', message: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setApplyingId(null);
    }
  };

  const changeCategory = async (entry: LedgerEntry, category: string) => {
    try {
      if (entry.type === 'expense') {
        await hedwigApi.updateExpense(entry.referenceId, { category: category as never }, opts);
      } else if ((entry.event_type ?? '').startsWith('imported_transaction.')) {
        await hedwigApi.matchImportedTransaction(entry.referenceId, { category }, opts);
      } else {
        toast({ type: 'default', title: 'Not editable', message: 'Only expenses and imported rows can be recategorized.' });
        return;
      }
      setEntries((prev) => prev.map((e) => (e.referenceId === entry.referenceId ? { ...e, category } : e)));
    } catch (err: unknown) {
      toast({ type: 'error', title: 'Recategorize failed', message: err instanceof Error ? err.message : 'Try again.' });
    }
  };

  const createCategory = async (entry: LedgerEntry) => {
    const name = newCategoryValue.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    if (!name) return;
    try {
      await hedwigApi.createTransactionCategory(name, opts);
      setCategories((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
      setNewCategoryFor(null);
      setNewCategoryValue('');
      await changeCategory(entry, name);
    } catch (err: unknown) {
      toast({ type: 'error', title: 'Could not create category', message: err instanceof Error ? err.message : 'Try again.' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Transactions</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
          Deposits and withdrawals across all accounts — match receipts, categorize, drill in.
        </p>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'net', title: 'Net change', value: formatAmount(summary.net, { compact: true }), helper: `This ${rangeLabel(range)}`, icon: CurrencyDollar },
          { id: 'in', title: 'Money in', value: formatAmount(summary.moneyIn, { compact: true }), helper: 'Inflows', icon: ArrowUp },
          { id: 'out', title: 'Money out', value: formatAmount(summary.moneyOut, { compact: true }), helper: 'Outflows', icon: ArrowDown },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            {entries.length} transaction{entries.length !== 1 ? 's' : ''}
          </span>
          {isRefreshing && <span className="text-[12px] text-[var(--color-text-muted)]">· syncing…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Dropdown>
            <HButton
              variant="secondary"
              className="mr-1 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[12px] font-medium text-[var(--color-foreground)]"
              aria-label="Filter transactions by timeframe and type"
            >
              <span>{RANGES.find((r) => r.value === range)?.label} · {KIND_FILTERS.find((k) => k.value === kind)?.label}</span>
              <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
            </HButton>
            <Dropdown.Popover className="min-w-[220px] p-3">
              <p className="px-1 pb-1.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]">Timeframe</p>
              <div className="flex flex-wrap gap-1 pb-2.5">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRange(r.value)}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                      range === r.value
                        ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="border-t border-[var(--color-border)] px-1 pb-1.5 pt-2.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]">Type</p>
              <div className="flex flex-wrap gap-1">
                {KIND_FILTERS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                      kind === k.value
                        ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </Dropdown.Popover>
          </Dropdown>
          <div className="relative mr-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions"
              aria-label="Search transactions"
              className="h-8 w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-7 text-[12px] text-[var(--color-foreground)] placeholder:text-[var(--color-text-placeholder)] transition focus:border-[var(--color-primary)] focus:outline-none sm:w-[200px]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-tertiary)] transition hover:text-[var(--color-foreground)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button variant="default" size="sm" onClick={() => setShowImport(true)} className="create-btn">
            <UploadSimple className="h-3.5 w-3.5" weight="bold" />
            Match receipts
          </Button>
        </div>
      </div>

      {isRefreshing && entries.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-20">
          <p className="text-[13px] text-[var(--color-text-tertiary)]">Loading transactions…</p>
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Transactions" className="min-w-[640px]" selectionMode="multiple" selectedKeys={selectedKeys} onSelectionChange={setSelectedKeys}>
              <Table.Header>
                <Table.Column className="w-10 pr-0">
                  <Checkbox aria-label="Select all" slot="selection" className="ml-3">
                    <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                  </Checkbox>
                </Table.Column>
                <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Date</Table.Column>
                <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">To / From</Table.Column>
                <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Amount</Table.Column>
                <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Account</Table.Column>
                <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Category</Table.Column>
                <Table.Column />
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                    <p className="text-[13px] text-[var(--color-text-muted)]">No transactions in this range.</p>
                  </div>
                )}
              >
                {pageItems.map((e) => {
                  const { from, to, out } = toFrom(e);
                  const amount = out ? Number(e.debit ?? 0) : Number(e.credit ?? 0);
                  return (
                    <Table.Row key={`${e.referenceId}-${e.type}`} id={`${e.referenceId}-${e.type}`} onAction={() => setDetailEntry(e)} className="cursor-pointer hover:bg-[var(--color-background)]">
                      <Table.Cell className="pr-0">
                        <Checkbox aria-label={`Select ${e.description}`} slot="selection" className="ml-3">
                          <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                        </Checkbox>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="whitespace-nowrap text-[13px] text-[var(--color-text-secondary)]">
                          {new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{out ? to : from}</p>
                        <p className="text-[12px] text-[var(--color-text-tertiary)]">
                          {out ? `From ${from}` : `To ${to}`}
                        </p>
                      </Table.Cell>
                      <Table.Cell>
                        <span className={`text-[13px] font-semibold tabular-nums ${out ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                          {out ? '−' : '+'}{fullUsd(amount).replace('−', '')}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-[13px] text-[var(--color-text-secondary)]">{e.account || '—'}</span>
                      </Table.Cell>
                      <Table.Cell onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label="Category"
                            value={e.category ?? ''}
                            onChange={(ev) => {
                              if (ev.target.value === '__new__') {
                                setNewCategoryFor(e.referenceId);
                                setNewCategoryValue('');
                              } else if (ev.target.value) {
                                void changeCategory(e, ev.target.value);
                              }
                            }}
                            className="h-8 max-w-[150px] appearance-none truncate rounded-lg border border-[var(--color-border)] bg-transparent px-2 text-[12px] text-[var(--color-foreground)] outline-none [&>option]:bg-[var(--color-surface)]"
                          >
                            <option value="">Uncategorized</option>
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__new__">+ New category…</option>
                          </select>
                        </div>
                        {newCategoryFor === e.referenceId && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={newCategoryValue}
                              onChange={(ev) => setNewCategoryValue(ev.target.value)}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter') void createCategory(e);
                                if (ev.key === 'Escape') setNewCategoryFor(null);
                              }}
                              placeholder="Name it…"
                              className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-transparent px-2 text-[12px] outline-none focus:border-[var(--color-primary)]"
                            />
                            <Button size="sm" variant="outline" onClick={() => createCategory(e)}>
                              Add
                            </Button>
                          </div>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex justify-end" onClick={(ev) => ev.stopPropagation()}>
                          <RowActionsMenu
                            items={[
                              { label: 'View details', onClick: () => setDetailEntry(e) },
                              ...(isImportedUnmatched(e)
                                ? [{ label: 'Match receipt', onClick: () => openMatchDialog(e) }]
                                : []),
                            ]}
                          />
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
          {entries.length > PAGE_SIZE && (
            <Table.Footer>
              <Pagination size="sm">
                <Pagination.Summary>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, entries.length)} of {entries.length}
                </Pagination.Summary>
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous isDisabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                      <Pagination.PreviousIcon />
                      Previous
                    </Pagination.Previous>
                  </Pagination.Item>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const startPage = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - 4));
                    const p = startPage + i;
                    return (
                      <Pagination.Item key={p}>
                        <Pagination.Link isActive={p === page} onPress={() => setPage(p)}>
                          {p}
                        </Pagination.Link>
                      </Pagination.Item>
                    );
                  })}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={page === totalPages}
                      onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </Table.Footer>
          )}
        </Table>
      )}

      {/* Match dialog */}
      <Modal open={matchFor !== null} onOpenChange={(o) => !o && setMatchFor(null)}>
        <ModalHeader>
          <ModalTitle>Match receipt</ModalTitle>
          <ModalDescription>
            {matchFor ? `Top invoice candidates for “${matchFor.description}”.` : ''}
          </ModalDescription>
        </ModalHeader>
        <ModalContent>
          {suggestionsLoading ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Scoring candidates…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-[13px] text-[var(--color-text-tertiary)]">No confident matches. Try the unpaid list instead.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <div key={s.invoiceId} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{s.invoiceLabel ?? s.invoiceId}</p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)]">
                      {(s.score * 100).toFixed(0)}% · {s.reasons.join(', ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={applyingId === s.transactionId}
                    onClick={() => applySuggestion(s)}
                  >
                    {applyingId === s.transactionId ? 'Applying…' : 'Apply'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ModalContent>
        <ModalFooter>
          <ModalClose onClose={() => setMatchFor(null)}>
            <Button variant="ghost">Close</Button>
          </ModalClose>
        </ModalFooter>
      </Modal>

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => refresh()}
        accessToken={accessToken}
      />

      {detailEntry && (
        <TransactionDetailPanel
          entry={detailEntry}
          accessToken={accessToken}
          onClose={() => setDetailEntry(null)}
        />
      )}
    </div>
  );

  function rangeLabel(r: string) {
    return r === '7d' ? 'week' : r === '90d' ? '90 days' : r === '1y' ? 'year' : 'month';
  }

}
