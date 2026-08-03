'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowSquareOut, CopySimple, FileText, MagnifyingGlass, PaperPlaneTilt, X } from '@/components/ui/lucide-icons';
import { Checkbox, Pagination, Table, type Selection } from '@heroui/react';
import type { Contract } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { backendConfig } from '@/lib/auth/config';

const PAGE_SIZE = 25;

const CONTRACT_STATUS = {
  draft:  { dot: 'bg-[var(--color-text-muted)]', label: 'Draft',  bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
  review: { dot: 'bg-[var(--color-accent)]', label: 'Review', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  signed: { dot: 'bg-[var(--color-success)]', label: 'Signed', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
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

  useAssistantPageContext('Contracts', {
    totalContracts: initialContracts.length,
    signedCount: initialContracts.filter((c) => c.status === 'signed').length,
    draftCount: initialContracts.filter((c) => c.status === 'draft').length,
    reviewCount: initialContracts.filter((c) => c.status === 'review').length,
  });

  const [contracts, setContracts] = useState(initialContracts);
  const [filter, setFilter] = useState('all');
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q)
        || (c.clientName ?? c.clientId ?? '').toLowerCase().includes(q);
    });
  }, [contracts, filter, search]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);
  const selectedCount = selectedKeys === 'all' ? filtered.length : selectedKeys.size;
  const pageStart = (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, filtered.length);

  const handleBulkDelete = async () => {
    if (selectedCount === 0 || !accessToken) return;
    setIsDeleting(true);
    const ids = selectedKeys === 'all' ? filtered.map((c) => c.id) : Array.from(selectedKeys).map(String);
    try {
      await Promise.all(ids.map((id) => hedwigApi.deleteDocument(id, { accessToken, disableMockFallback: true }).catch(() => null)));
      const removed = new Set(ids);
      setContracts((cur) => cur.filter((c) => !removed.has(c.id)));
      setSelectedKeys(new Set());
      toast({ type: 'success', title: `${ids.length} contract${ids.length !== 1 ? 's' : ''} deleted` });
    } catch {
      toast({ type: 'error', title: 'Failed to delete contracts', message: 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

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

  const handleUploadToDrive = async (contract: Contract) => {
    if (!accessToken) return;
    try {
    const resp = await fetch('/api/backend/api/integrations/composio/drive/upload-from-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ documentId: contract.id, documentType: 'CONTRACT' }),
    });
      const payload = await resp.json();
      toast({
        type: payload.success ? 'success' : 'error',
        title: payload.success ? 'Uploaded to Google Drive' : 'Upload failed',
        message: payload.success ? 'Contract PDF sent to your Drive.' : payload.error || 'Please try again.',
      });
    } catch {
      toast({ type: 'error', title: 'Upload failed', message: 'Could not upload to Google Drive.' });
    }
  };

  const handleCreateDocs = async (contract: Contract) => {
    if (!accessToken) return;
    try {
    const resp = await fetch('/api/backend/api/integrations/composio/docs/create-from-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ documentId: contract.id }),
    });
      const payload = await resp.json();
      toast({
        type: payload.success ? 'success' : 'error',
        title: payload.success ? 'Google Doc created' : 'Docs creation failed',
        message: payload.success ? 'Contract has been opened in Google Docs.' : payload.error || 'Please try again.',
      });
    } catch {
      toast({ type: 'error', title: 'Docs creation failed', message: 'Could not create Google Doc.' });
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
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/contract/${contract.id}`, 'Contract link copied') },
      { label: 'Upload to Google Drive', onClick: () => handleUploadToDrive(contract) },
      { label: 'Create Google Doc', onClick: () => handleCreateDocs(contract) },
    ];
    if (contract.status !== 'signed') {
      items.push({ label: 'Send contract', onClick: () => handleSend(contract) });
    }
    items.push({ label: 'Delete', onClick: () => setContractToDelete(contract), destructive: true });
    return items;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Contracts</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Create, send, and manage signed agreements with your clients.</p>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'total', title: 'Total', value: String(contracts.length), helper: 'Contracts' },
          { id: 'signed', title: 'Signed', value: String(signedCount), helper: 'Fully executed' },
          { id: 'review', title: 'In review', value: String(reviewCount), helper: 'Awaiting signature' },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            {contracts.length} contract{contracts.length !== 1 ? 's' : ''}
          </span>
          {(signedCount > 0 || reviewCount > 0) && (
            <span className="text-[12px] text-[var(--color-text-muted)]">
              · {signedCount} signed{reviewCount > 0 ? `, ${reviewCount} in review` : ''}
              {isRefreshing ? ' · syncing…' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative mr-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contracts"
              aria-label="Search contracts"
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
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(s)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                filter === s
                  ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {s === 'all' ? 'All' : CONTRACT_STATUS[s as keyof typeof CONTRACT_STATUS]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Contracts"
            className="min-w-[500px]"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          >
            <Table.Header>
              <Table.Column className="w-10 pr-0">
                <Checkbox slot="selection" aria-label="Select all contracts" className="ml-3">
                  <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Title</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Client</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <p className="text-[13px] text-[var(--color-text-muted)]">
                    {filter === 'all' && !search ? 'No contracts yet.' : 'No contracts match your filters.'}
                  </p>
                </div>
              )}
            >
              {pageItems.map((contract) => {
                const s = CONTRACT_STATUS[contract.status] ?? CONTRACT_STATUS.draft;
                const isHighlighted = contract.id === highlightedContractId;
                return (
                  <Table.Row key={contract.id} id={contract.id} className={`hover:bg-[var(--color-background)] ${isHighlighted ? 'bg-[var(--color-accent-soft)]' : ''}`}>
                    <Table.Cell className="pr-0">
                      <Checkbox slot="selection" aria-label={`Select ${contract.title}`} className="ml-3">
                        <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                      </Checkbox>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="min-w-0">
                        <Link href={`${backendConfig.publicPagesUrl}/contract/${contract.id}`} target="_blank" className="group flex items-center gap-1.5">
                          <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-text-tertiary)] transition-colors">{contract.title}</p>
                          <ArrowSquareOut className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
                        </Link>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusPill dot={s.dot} label={s.label} bg={s.bg} text={s.text} />
                    </Table.Cell>
                    <Table.Cell>
                      <p className="truncate text-[13px] text-[var(--color-text-tertiary)]">{contract.clientName || contract.clientId || 'Unassigned'}</p>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu items={contractActions(contract)} />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {filtered.length > PAGE_SIZE && (
          <Table.Footer>
            <Pagination size="sm">
              <Pagination.Summary>
                {filtered.length === 0 ? '0 contracts' : `${pageStart}–${pageEnd} of ${filtered.length} contracts`}
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
                  <Pagination.Next isDisabled={page === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          </Table.Footer>
        )}
      </Table>

      {selectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <p className="text-[12px] font-medium text-[var(--color-text-secondary)]">
            {selectedCount} contract{selectedCount !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>Clear</Button>
            <Button variant="destructive" size="sm" disabled={isDeleting || isActionLoading} onClick={() => void handleBulkDelete()}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}

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

function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
