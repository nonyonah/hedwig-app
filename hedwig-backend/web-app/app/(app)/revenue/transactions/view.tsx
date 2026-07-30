'use client';

import { useState, useEffect } from 'react';
import { Bank, CaretDown, ArrowsLeftRight } from '@/components/ui/lucide-icons';
import { Loader } from '@/components/ui/loader';
import { hedwigApi } from '@/lib/api/client';
import { Table } from '@heroui/react';
import { useToast } from '@/components/providers/toast-provider';
import { formatShortDate } from '@/lib/utils';
import type { ImportedTransaction, StatementImport, ImportedTransactionStatus, StatementImportStatus } from '@/lib/types/revenue';

const STMT_STATUS_COLOR: Record<StatementImportStatus, string> = {
  pending: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]',
  reviewing: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  confirmed: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  partially_confirmed: 'bg-[var(--color-warning-soft)] text-[var(--color-warning-dark)]',
  cancelled: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

const TXN_STATUS_COLOR: Record<string, string> = {
  expensed: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  reconciled: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  skipped: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]',
  matched: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  pending: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
};

const FILTERS = ['all', 'pending', 'reviewing', 'confirmed'] as const;

export function TransactionsClient({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTxns, setExpandedTxns] = useState<Record<string, ImportedTransaction[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    hedwigApi.statementImports({ accessToken })
      .then((data) => setImports(data as any as StatementImport[]))
      .catch(() => toast({ type: 'error', title: 'Failed to load imports', message: 'Could not load import history.' }))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (expandedTxns[id]) return;
    setLoadingDetail(id);
    try {
      const detail = await hedwigApi.statementImportDetail(id, { accessToken: accessToken ?? undefined }) as any;
      setExpandedTxns((prev) => ({ ...prev, [id]: (detail.transactions || []) as ImportedTransaction[] }));
    } catch {
      toast({ type: 'error', title: 'Failed to load transactions', message: 'Could not load transaction detail.' });
    } finally {
      setLoadingDetail(null);
    }
  };

  const filtered = filter === 'all' ? imports : imports.filter((s) => s.status === filter);

  // Deduplicate: group by (bankName, startDate, endDate, transactionCount), keep first
  const seen = new Set<string>();
  const deduped = filtered.filter((s) => {
    const key = `${s.bankName ?? ''}|${s.startDate ?? ''}|${s.endDate ?? ''}|${s.transactionCount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size={24} />
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-20 text-center">
        <Bank className="h-8 w-8 text-[var(--color-border-input)]" weight="thin" />
        <p className="text-[13px] text-[var(--color-text-muted)]">No imports yet. Import a statement from the Overview tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {deduped.length} import{deduped.length !== 1 ? 's' : ''}
          {deduped.length < filtered.length ? ` (${filtered.length - deduped.length} duplicate${filtered.length - deduped.length !== 1 ? 's' : ''} merged)` : ''}
        </span>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                filter === f
                  ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="divide-y divide-[var(--color-border)]">
          {deduped.map((stmt) => (
            <div key={stmt.id}>
              <button
                onClick={() => toggleExpand(stmt.id)}
                className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)]">
                  <Bank className="h-4 w-4 text-[var(--color-text-muted)]" weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{stmt.originalFilename}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                    {stmt.bankName || 'Unknown bank'}{stmt.accountNumber ? ` · ${stmt.accountNumber}` : ''}
                    {stmt.transactionCount ? ` · ${stmt.transactionCount} txns` : ''}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STMT_STATUS_COLOR[stmt.status] || STMT_STATUS_COLOR.pending}`}>
                  {stmt.status === 'partially_confirmed' ? 'Partially confirmed' : stmt.status.charAt(0).toUpperCase() + stmt.status.slice(1)}
                </span>
                <span className="text-right text-[12px] text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
                  {formatShortDate(stmt.createdAt)}
                </span>
                <CaretDown className={`h-4 w-4 text-[var(--color-text-muted)] transition ${expandedId === stmt.id ? 'rotate-180' : ''}`} weight="bold" />
              </button>

              {expandedId === stmt.id && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
                  {loadingDetail === stmt.id ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader size={20} />
                    </div>
                  ) : (
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Statement transactions">
                          <Table.Header>
                            <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Date</Table.Column>
                            <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Description</Table.Column>
                            <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Bank</Table.Column>
                            <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Amount</Table.Column>
                            <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {(expandedTxns[stmt.id] || []).map((txn) => (
                              <Table.Row key={txn.id} className="hover:bg-[var(--color-surface)]">
                                <Table.Cell className="whitespace-nowrap text-[var(--color-text-muted)]">{txn.transactionDate}</Table.Cell>
                                <Table.Cell className="max-w-[250px] truncate text-[var(--color-foreground)]"><span title={txn.description}>{txn.description}</span></Table.Cell>
                                <Table.Cell className="whitespace-nowrap text-[12px] text-[var(--color-text-muted)]">{txn.bankName || '—'}</Table.Cell>
                                <Table.Cell className={`whitespace-nowrap font-medium tabular-nums ${txn.type === 'debit' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                                  {txn.type === 'debit' ? '-' : '+'}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {txn.currency}
                                </Table.Cell>
                                <Table.Cell>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TXN_STATUS_COLOR[txn.status] || TXN_STATUS_COLOR.pending}`}>
                                    {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                                  </span>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                            {(expandedTxns[stmt.id] || []).length === 0 && (
                              <Table.Row>
                                <Table.Cell colSpan={5} className="text-center text-[12px] text-[var(--color-text-muted)]">
                                No transactions found.
                              </Table.Cell>
                            </Table.Row>
                          )}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
