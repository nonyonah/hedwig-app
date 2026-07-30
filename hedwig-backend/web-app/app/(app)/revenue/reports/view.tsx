'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChartBar, FileText, DownloadSimple, CurrencyCircleDollar, CalendarBlank, Sparkle, ArrowsLeftRight, ArrowUp, ArrowDown } from '@/components/ui/lucide-icons';
import { Loader } from '@/components/ui/loader';
import { AttachedStatGrid, type AttachedStatCardItem } from '@/components/ui/attached-stat-cards';
import { Table } from '@heroui/react';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';

type ReportType = 'pnl' | 'cashflow' | 'journal';

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

function formatAmount(value: number): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? '−' : '';
  return `${prefix}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReportsClient({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const [activeReport, setActiveReport] = useState<ReportType>('pnl');
  const [loading, setLoading] = useState(true);
  const [ledgerData, setLedgerData] = useState<{
    entries: any[]; summary: { totalRevenue: number; totalExpenses: number; netIncome: number; entryCount: number };
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  } | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [journalPage, setJournalPage] = useState(1);

  const loadLedger = useCallback(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([
      hedwigApi.ledger({ range: '30d', type: 'all', page: journalPage }, { accessToken }),
      hedwigApi.ledgerNarrative('30d', { accessToken }),
    ])
      .then(([ledger, narr]) => {
        setLedgerData(ledger as any);
        setNarrative((narr as any).narrative || null);
      })
      .catch(() => toast({ type: 'error', title: 'Failed to load', message: 'Could not load report data.' }))
      .finally(() => setLoading(false));
  }, [accessToken, journalPage]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const handleExport = async () => {
    if (!accessToken) return;
    try {
      const blob = await hedwigApi.ledgerExportBlob('30d', { accessToken });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hedwig-pnl-30d-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ type: 'success', title: 'Exported', message: 'P&L export downloaded.' });
    } catch {
      toast({ type: 'error', title: 'Export failed', message: 'Could not generate XLSX export.' });
    }
  };

  const reportTabs: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: 'pnl', label: 'P&L', icon: <ChartBar className="h-4 w-4" weight="bold" /> },
    { key: 'cashflow', label: 'Cash Flow', icon: <CalendarBlank className="h-4 w-4" weight="bold" /> },
    { key: 'journal', label: 'Journal', icon: <ArrowsLeftRight className="h-4 w-4" weight="bold" /> },
  ];

  if (loading && !ledgerData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size={24} />
      </div>
    );
  }

  const summary = ledgerData?.summary;
  const entries = ledgerData?.entries || [];
  const displayNarrative = narrative ? stripMarkdown(narrative) : null;

  const statCards: AttachedStatCardItem[] = summary ? [
    {
      id: 'revenue',
      title: 'Revenue',
      value: formatAmount(summary.totalRevenue),
      icon: ArrowUp,
      iconClassName: 'text-[var(--color-success)]',
      iconWrapClassName: 'bg-[var(--color-success-soft)]',
    },
    {
      id: 'expenses',
      title: 'Expenses',
      value: formatAmount(summary.totalExpenses),
      icon: ArrowDown,
      iconClassName: 'text-[var(--color-danger)]',
      iconWrapClassName: 'bg-[var(--color-danger-soft)]',
    },
    {
      id: 'net-income',
      title: 'Net Income',
      value: formatAmount(summary.netIncome),
      icon: ChartBar,
      iconClassName: summary.netIncome >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
      iconWrapClassName: summary.netIncome >= 0 ? 'bg-[var(--color-success-soft)]' : 'bg-[var(--color-danger-soft)]',
    },
  ] : [];

  return (
    <div className="space-y-5">
      {/* AI Narrative */}
      {displayNarrative && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)]">
            <Sparkle className="h-4 w-4 text-[var(--color-accent)]" weight="fill" />
          </span>
          <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed">{displayNarrative}</p>
        </div>
      )}

      {/* Report tabs — w-fit so it doesn't stretch full width */}
      <div className="w-fit rounded-xl bg-[var(--color-surface-secondary)] p-1">
        <div className="flex gap-1">
          {reportTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveReport(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                activeReport === tab.key
                  ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-xs'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!summary ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-20 text-center">
          <CurrencyCircleDollar className="h-8 w-8 text-[var(--color-border-input)]" weight="thin" />
          <p className="text-[13px] text-[var(--color-text-muted)]">No data yet. Add invoices or expenses to see reports.</p>
        </div>
      ) : (
        <>
          {activeReport === 'pnl' && (
            <div className="space-y-4">
              <AttachedStatGrid items={statCards} className="grid-cols-1 md:grid-cols-3" />

              <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="border-b border-[var(--color-border)] px-5 py-3">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Recent activity</p>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {entries.slice(0, 10).map((entry: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-background)]">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        entry.debit > 0 ? 'bg-[var(--color-danger-soft)]' : 'bg-[var(--color-success-soft)]'
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${
                          entry.debit > 0 ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-success)]'
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{entry.description}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{entry.date} · {entry.account}</p>
                      </div>
                      <p className={`shrink-0 text-[13px] font-semibold tabular-nums ${entry.debit > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                        {entry.debit > 0 ? `-$${entry.debit.toFixed(2)}` : `+$${entry.credit.toFixed(2)}`}
                      </p>
                    </div>
                  ))}
                  {entries.length === 0 && (
                    <div className="px-5 py-8 text-center text-[12px] text-[var(--color-text-muted)]">
                      No transactions in this period.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-background)]"
                >
                  <DownloadSimple className="h-4 w-4" weight="bold" />
                  Export as XLSX
                </button>
              </div>
            </div>
          )}

          {activeReport === 'cashflow' && (
            <div className="space-y-4">
              <AttachedStatGrid items={statCards} className="grid-cols-1 md:grid-cols-3" />

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Cash Flow Statement</p>
                <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)] leading-relaxed">
                  Cash flow tracking is most useful once you have 3+ months of data. Currently showing a simplified operating view based on your revenue and expenses.
                </p>
              </div>
            </div>
          )}

          {activeReport === 'journal' && (
            <div className="space-y-4">
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Journal entries">
                    <Table.Header>
                      <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Date</Table.Column>
                      <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Description</Table.Column>
                      <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Account</Table.Column>
                      <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Debit</Table.Column>
                      <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Credit</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {entries.map((entry: any, idx: number) => (
                        <Table.Row key={idx} className="hover:bg-[var(--color-background)]">
                          <Table.Cell className="whitespace-nowrap text-[var(--color-text-muted)] tabular-nums">{entry.date}</Table.Cell>
                          <Table.Cell className="max-w-[280px] truncate text-[var(--color-foreground)]"><span title={entry.description}>{entry.description}</span></Table.Cell>
                          <Table.Cell className="text-[var(--color-text-muted)]">{entry.account}</Table.Cell>
                          <Table.Cell className="text-right font-semibold tabular-nums text-[var(--color-danger)]">{entry.debit > 0 ? `$${entry.debit.toFixed(2)}` : ''}</Table.Cell>
                          <Table.Cell className="text-right font-semibold tabular-nums text-[var(--color-success)]">{entry.credit > 0 ? `$${entry.credit.toFixed(2)}` : ''}</Table.Cell>
                        </Table.Row>
                      ))}
                      {entries.length === 0 && (
                        <Table.Row>
                          <Table.Cell colSpan={5} className="text-center text-[12px] text-[var(--color-text-muted)]">
                            No journal entries for this period.
                          </Table.Cell>
                        </Table.Row>
                      )}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>

              {ledgerData && ledgerData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Page {ledgerData.pagination.page} of {ledgerData.pagination.totalPages} ({ledgerData.pagination.total} entries)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                      disabled={journalPage <= 1}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-background)] disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setJournalPage((p) => Math.min(ledgerData.pagination.totalPages, p + 1))}
                      disabled={journalPage >= ledgerData.pagination.totalPages}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-background)] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
