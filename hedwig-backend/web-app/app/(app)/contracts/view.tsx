'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowSquareOut, CopySimple, FileText, PaperPlaneTilt } from '@/components/ui/lucide-icons';
import type { Contract } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useToast } from '@/components/providers/toast-provider';
import { backendConfig } from '@/lib/auth/config';

const CONTRACT_STATUS = {
  draft:  { dot: 'bg-[#a4a7ae]', label: 'Draft',  bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  review: { dot: 'bg-[#2563eb]', label: 'Review', bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  signed: { dot: 'bg-[#12b76a]', label: 'Signed', bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
} as const;

const STATUS_FILTERS = ['all', 'draft', 'review', 'signed'] as const;

export function ContractsClient({
  initialContracts,
  accessToken,
  highlightedContractId
}: {
  initialContracts: Contract[];
  accessToken: string | null;
  highlightedContractId?: string | null;
}) {
  const { toast } = useToast();
  const [contracts, setContracts] = useState(initialContracts);
  const [filter, setFilter] = useState('all');
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    const refreshContracts = async () => {
      setIsRefreshing(true);
      try {
        const liveContracts = await hedwigApi.contracts({ accessToken, disableMockFallback: true });
        if (!cancelled) {
          setContracts(liveContracts);
        }
      } catch {
        // Keep server-provided contracts if refresh fails.
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    };

    void refreshContracts();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const signedCount = useMemo(() => contracts.filter((c) => c.status === 'signed').length, [contracts]);
  const reviewCount = useMemo(() => contracts.filter((c) => c.status === 'review').length, [contracts]);
  const draftCount = useMemo(() => contracts.filter((c) => c.status === 'draft').length, [contracts]);

  const filtered = useMemo(
    () => (filter === 'all' ? contracts : contracts.filter((c) => c.status === filter)),
    [contracts, filter]
  );

  const handleDelete = async () => {
    if (!contractToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      await hedwigApi.deleteDocument(contractToDelete.id, { accessToken, disableMockFallback: true });
      setContracts((cur) => cur.filter((c) => c.id !== contractToDelete.id));
      toast({ type: 'success', title: 'Contract deleted', message: `${contractToDelete.title} was removed.` });
      setContractToDelete(null);
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to delete contract', message: error?.message || 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const copyText = async (value: string, title: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: 'success', title, message: 'Copied to clipboard.' });
    } catch {
      toast({ type: 'error', title: 'Copy failed', message: 'Please try again.' });
    }
  };

  const handleSend = async (contract: Contract) => {
    if (!accessToken) return;
    setIsActionLoading(true);
    try {
      const result = await hedwigApi.sendContract(contract.id, { accessToken, disableMockFallback: true });
      toast({
        type: result.emailSent ? 'success' : 'warning',
        title: result.emailSent ? 'Contract sent' : 'Contract prepared',
        message: result.emailSent
          ? `Emailed${result.clientEmail ? ` to ${result.clientEmail}` : ''}.`
          : 'Send completed but email delivery was not confirmed.'
      });
      setContracts((cur) => cur.map((c) => (c.id === contract.id ? { ...c, status: 'review' } : c)));
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to send contract', message: error?.message || 'Please try again.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const contractActions = (contract: Contract): RowActionItem[] => {
    const items: RowActionItem[] = [
      { label: 'Open', onClick: () => { window.open(`${backendConfig.publicPagesUrl}/contract/${contract.id}`, '_blank'); } },
      { label: 'Download PDF', onClick: () => { window.open(`${backendConfig.publicPagesUrl}/contract/${contract.id}?print=1`, '_blank'); } },
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/contract/${contract.id}`, 'Contract link copied') }
    ];
    if (contract.status !== 'signed') {
      items.push({ label: 'Send contract', onClick: () => handleSend(contract) });
    }
    items.push({ label: 'Delete', onClick: () => setContractToDelete(contract), destructive: true });
    return items;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">Contracts</h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Create, send, and manage signed agreements with your clients.</p>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'total', title: 'Total', value: String(contracts.length), helper: 'Contracts' },
          { id: 'signed', title: 'Signed', value: String(signedCount), helper: 'Fully executed' },
          { id: 'review', title: 'In review', value: String(reviewCount), helper: 'Awaiting signature' },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Unified header */}
        <div className="flex items-center gap-3 border-b border-[#f2f4f7] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="text-[12px] font-medium text-[#717680]">{contracts.length} contracts</span>
            {(signedCount > 0 || reviewCount > 0) && (
              <>
                <span className="h-3 w-px shrink-0 bg-[#f2f4f7]" />
                <span className="truncate text-[12px] text-[#a4a7ae]">
                  {signedCount} signed{reviewCount > 0 ? ` · ${reviewCount} in review` : ''}
                  {isRefreshing ? ' · syncing…' : ''}
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === s
                    ? 'bg-[#f5f5f5] text-[#181d27]'
                    : 'text-[#8d9096] hover:bg-[#f9fafb] hover:text-[#414651]'
                }`}
              >
                {s === 'all' ? 'All' : CONTRACT_STATUS[s as keyof typeof CONTRACT_STATUS]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_110px_160px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Title</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Status</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Client</span>
          <span />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <EmptyState text="No contracts match this filter." />
        ) : (
          <div className="divide-y divide-[#f9fafb]">
            {filtered.map((contract) => {
              const s = CONTRACT_STATUS[contract.status] ?? CONTRACT_STATUS.draft;
              const isHighlighted = contract.id === highlightedContractId;
              return (
                <div key={contract.id} className={`grid grid-cols-[1fr_110px_160px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa] ${isHighlighted ? 'bg-[#f5f8ff]' : ''}`}>
                  <div className="min-w-0">
                    <Link href={`${backendConfig.publicPagesUrl}/contract/${contract.id}`} target="_blank" className="group flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-[#181d27] group-hover:text-[#717680] transition-colors">{contract.title}</p>
                      <ArrowSquareOut className="h-3.5 w-3.5 shrink-0 text-[#a4a7ae] opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
                    </Link>
                  </div>
                  <StatusPill dot={s.dot} label={s.label} bg={s.bg} text={s.text} />
                  <p className="truncate text-[13px] text-[#717680]">{contract.clientName || contract.clientId || 'Unassigned'}</p>
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu items={contractActions(contract)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeleteDialog
        open={!!contractToDelete}
        title="Delete contract"
        description="This removes the contract from your workspace."
        itemLabel={contractToDelete?.title}
        isDeleting={isDeleting || isActionLoading}
        onConfirm={handleDelete}
        onOpenChange={(open) => { if (!open && !isDeleting && !isActionLoading) setContractToDelete(null); }}
      />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}

function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
