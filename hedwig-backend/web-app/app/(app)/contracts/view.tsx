'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowSquareOut, CheckCircle, CopySimple, FileText, PencilSimpleLine, PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr';
import type { Contract } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { PageHeader } from '@/components/data/page-header';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
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
      { label: 'Open', onClick: () => window.location.assign(`${backendConfig.publicPagesUrl}/contract/${contract.id}`) },
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/contract/${contract.id}`, 'Contract link copied') }
    ];
    if (contract.status !== 'signed') {
      items.push({ label: 'Send contract', onClick: () => handleSend(contract) });
    }
    items.push({ label: 'Delete', onClick: () => setContractToDelete(contract), destructive: true });
    return items;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contracts"
        title="Agreements"
        description="Contracts are part of the operating workflow, not a separate legal island."
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <StatItem icon={<FileText className="h-4 w-4 text-[#2563eb]" weight="bold" />} label="Total contracts" value={`${contracts.length}`} sub="across all statuses" accent="text-[#181d27]" />
        <StatItem icon={<PencilSimpleLine className="h-4 w-4 text-[#f59e0b]" weight="bold" />} label="In review" value={`${reviewCount + draftCount}`} sub={`${draftCount} draft, ${reviewCount} with client`} accent="text-[#f59e0b]" />
        <StatItem icon={<CheckCircle className="h-4 w-4 text-[#12b76a]" weight="bold" />} label="Signed" value={`${signedCount}`} sub="fully executed" accent="text-[#12b76a]" />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[#181d27]">Contract workspace</p>
            <p className="text-[12px] text-[#a4a7ae] mt-0.5">{contracts.length} contract{contracts.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
                {s === 'all' ? 'All' : CONTRACT_STATUS[s as keyof typeof CONTRACT_STATUS]?.label ?? s}
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_110px_160px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <ColHead>Title</ColHead>
          <ColHead>Status</ColHead>
          <ColHead>Client</ColHead>
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
                      <p className="truncate text-[13px] font-semibold text-[#181d27] group-hover:text-[#2563eb] transition-colors">{contract.title}</p>
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

/* ── shared sub-components ── */
function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function StatItem({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[12px] font-medium text-[#717680]">{label}</span></div>
      <p className={`text-[22px] font-bold tracking-[-0.03em] ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#a4a7ae]">{sub}</p>
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{children}</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${active ? 'bg-[#eff4ff] text-[#2563eb]' : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'}`}>
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <FileText className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}
