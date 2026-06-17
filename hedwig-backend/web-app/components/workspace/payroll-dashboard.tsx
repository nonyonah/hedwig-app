'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  ArrowDown, ArrowRight, ArrowsClockwise, CaretDown, CaretRight,
  Check, CheckCircle, Coins, DotsThreeOutline, IdentificationCard, ShareNetwork, Trash, UsersThree, Warning, X, ArrowSquareOut,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid, type AttachedStatCardItem } from '@/components/ui/attached-stat-cards';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';
import { formatShortDate } from '@/lib/utils';
import { useFundWallet } from '@privy-io/react-auth';
import { OfframpModal } from '@/components/wallet/offramp-modal';

const BASESCAN_TX = (hash: string) => `https://basescan.org/tx/${hash}`;

function statusPill(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    executing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    partial_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return map[status] ?? map.pending;
}

function fmtUsd(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) / 1e6 : v;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface Member {
  userId: string; firstName?: string; lastName?: string; email?: string; role: string;
}
interface PreviewData {
  totalUsdc: string; totalUsd: string; treasuryBalanceAfter: string;
  treasuryBalanceAfterUsd: string; items: PreviewItem[]; previewToken: string; expiresAt: string;
}
interface PreviewItem { userId: string; name: string; amountUsdc: string; amountUsd: string; }
interface PayrollRunItem { recipientName: string; amountUsd: string; status: string; txHash?: string; }
interface PayrollRun {
  id: string; runType: string; totalAmountUsd: string; status: string;
  initiatedBy: { id: string; name: string }; itemCount: number; successCount: number;
  failedCount: number; createdAt: string; completedAt?: string;
  scheduledPayrollId?: string | null;
  items: PayrollRunItem[];
}

// ─── Component ─────────────────────────────────────────────────────────────

function MemberRow({ member, amount, onAmount }: { member: Member; amount: string; onAmount: (uid: string, v: string) => void }) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || member.userId;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2.5 mb-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[11px] font-semibold text-[var(--color-text-secondary)]">
        {(name[0] || '?').toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-[var(--color-foreground)]">{name}</p>
        <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{member.role}</p>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[12px] text-[var(--color-text-muted)]">$</span>
        <input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => onAmount(member.userId, e.target.value)} className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-right text-[12px] tabular-nums text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]" />
      </div>
    </div>
  );
}

export function PayrollDashboard() {
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const { fundWallet } = useFundWallet();

  const api = async (url: string, method = 'GET', body?: any) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}${url}`, {
      method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (j.code === 'INSUFFICIENT_FUNDS') {
        const deficit = j.deficit ? fmtUsd(j.deficit) : '0.00';
        const chain = j.chain ? ` (${j.chain.replace('_', ' ')})` : '';
        throw new Error(`Treasury balance too low${chain}. You need $${deficit} more to run this payroll.`);
      }
      const msg = typeof j?.error === 'string' ? j.error : (j?.error?.message || j?.error || `Request failed (${res.status})`);
      throw new Error(msg);
    }
    return j;
  };

  // ── Treasury ──
  const [treasury, setTreasury] = useState<{
    balanceUsd: string; reservedUsd: string; availableUsd: string;
    treasuryAddress: string | null; testnet: boolean;
  } | null>(null);

  // ── Dialogs ──
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [offrampOpen, setOfframpOpen] = useState(false);

  // ── Run Payroll (inside dialog) ──
  const [members, setMembers] = useState<Member[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [runType, setRunType] = useState<'fixed' | 'project'>('fixed');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payroll dialog sub-view
  type PayrollView = 'form' | 'preview';
  const [payrollView, setPayrollView] = useState<PayrollView>('form');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ status: string; successCount: number; failedCount: number } | null>(null);

  // ── History (main page table) ──
  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // ── Main page tab ──
  type MainTab = 'history' | 'scheduled';
  const [mainTab, setMainTab] = useState<MainTab>('history');

  // ── Schedules ──
  interface PayrollSchedule {
    id: string; frequency: string; dayOfMonth?: number; dayOfWeek?: number;
    nextRunAt: string; lastRunAt?: string; lastRunId?: string;
    status: string; totalUsd: string; itemCount: number;
    items: Array<{ userId: string; name: string; amountUsd: string }>;
    createdAt: string;
  }
  const [schedules, setSchedules] = useState<PayrollSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedFreq, setSchedFreq] = useState<'minute' | 'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [schedDayOfMonth, setSchedDayOfMonth] = useState(25);
  const [schedDayOfWeek, setSchedDayOfWeek] = useState(1);
  const [schedAmounts, setSchedAmounts] = useState<Record<string, string>>({});
  const [editingSchedule, setEditingSchedule] = useState<PayrollSchedule | null>(null);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [schedSaving, setSchedSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // ── Open schedule dialog in edit mode ──
  const openEditSchedule = (s: PayrollSchedule) => {
    setEditingSchedule(s);
    setSchedFreq((s.frequency as any) || 'monthly');
    setSchedDayOfMonth(s.dayOfMonth ?? 25);
    setSchedDayOfWeek(s.dayOfWeek ?? 1);
    const amounts: Record<string, string> = {};
    for (const item of s.items) {
      amounts[item.userId] = (parseFloat(item.amountUsd.replace(/,/g, '')) * 1).toFixed(2);
    }
    setSchedAmounts(amounts);
    setScheduleOpen(true);
  };

  // ── Open schedule dialog in create mode ──
  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setSchedFreq('monthly');
    setSchedDayOfMonth(25);
    setSchedDayOfWeek(1);
    setSchedAmounts({});
    setScheduleOpen(true);
  };

  // ── Fetch treasury ──
  useEffect(() => {
    if (!activeWorkspace || activeWorkspace.type !== 'organization') return;
    api(`/api/workspaces/${activeWorkspace.id}/treasury`)
      .then(d => setTreasury({
        balanceUsd: d.data?.balanceUsd || '0.00',
        reservedUsd: fmtUsd(d.data?.reservedUsdc || '0'),
        availableUsd: fmtUsd(d.data?.availableUsdc || '0'),
        treasuryAddress: d.data?.treasuryAddress || null,
        testnet: d.data?.testnet ?? false,
      }))
      .catch(() => {});
  }, [activeWorkspace]);

  // ── Fetch history ──
  const refreshHistory = useCallback(() => {
    if (!activeWorkspace || activeWorkspace.type !== 'organization') return;
    setLoadingHistory(true);
    api(`/api/workspaces/${activeWorkspace.id}/payroll/history?page=${historyPage}&limit=20`)
      .then(d => { setHistory(d.data?.runs || []); setHistoryTotal(d.data?.total || 0); })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [activeWorkspace, historyPage, accessToken]);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // ── Fetch schedules ──
  const refreshSchedules = useCallback(() => {
    if (!activeWorkspace || activeWorkspace.type !== 'organization') return;
    setLoadingSchedules(true);
    api(`/api/workspaces/${activeWorkspace.id}/payroll/schedules`)
      .then(d => setSchedules(d.data?.schedules || []))
      .catch(() => {})
      .finally(() => setLoadingSchedules(false));
  }, [activeWorkspace, accessToken]);

  useEffect(() => { if (mainTab === 'scheduled') refreshSchedules(); }, [mainTab, refreshSchedules]);

  // ── Fetch members when payroll dialog opens ──
  useEffect(() => {
    if (!payrollOpen || !activeWorkspace) return;
    setLoadingMembers(true); setError(null);
    api(`/api/workspaces/${activeWorkspace.id}/members`)
      .then(d => setMembers(d.data?.members || []))
      .catch(e => setError(e.message))
      .finally(() => setLoadingMembers(false));
  }, [payrollOpen, activeWorkspace]);

  // Reset dialog state on close
  const closePayrollDialog = () => {
    setPayrollOpen(false); setPayrollView('form'); setPreview(null);
    setAmounts({}); setRunResult(null); setError(null); setLoadingPreview(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ── Preview countdown ──
  useEffect(() => {
    if (!preview) return;
    const expiry = new Date(preview.expiresAt).getTime();
    const tick = () => { const r = Math.max(0, Math.floor((expiry - Date.now()) / 1000)); setTimeLeft(r); };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [preview]);

  // ── Actions ──
  const setAmt = (uid: string, v: string) => {
    if (v !== '' && !/^\d*\.?\d{0,2}$/.test(v)) return;
    setAmounts(p => ({ ...p, [uid]: v }));
  };

  const handlePreview = async () => {
    if (!activeWorkspace) return;
    const items = Object.entries(amounts)
      .filter(([, v]) => v && parseFloat(v) > 0)
      .map(([userId, amount]) => ({ userId, amountUsdc: (parseFloat(amount) * 1e6).toString() }));
    if (!items.length) { setError('Enter at least one amount'); return; }
    setError(null);
    setLoadingPreview(true);
    try {
      const res = await api(`/api/workspaces/${activeWorkspace.id}/payroll/preview`, 'POST', { runType, items });
      setPreview(res.data); setPayrollView('preview');
    } catch (e: any) { setError(e.message); }
    finally { setLoadingPreview(false); }
  };

  const handleRun = async () => {
    if (!activeWorkspace || !preview) return;
    setRunning(true); setError(null);
    try {
      const res = await api(`/api/workspaces/${activeWorkspace.id}/payroll/run`, 'POST', { previewToken: preview.previewToken });
      setRunResult(res.data);
    } catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  };

  const handleRetry = async (runId: string) => {
    if (!activeWorkspace) return;
    setRetrying(runId);
    try { await api(`/api/workspaces/${activeWorkspace.id}/payroll/${runId}/retry`, 'POST'); refreshHistory(); }
    catch (e: any) { setError(e.message); }
    finally { setRetrying(null); }
  };

  // ── Derived ──
  const membersWithoutOwner = members.filter(m => m.role !== 'owner');

  // ── Guard ──
  if (!activeWorkspace || activeWorkspace.type === 'personal') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Coins className="mx-auto h-10 w-10 text-[var(--color-text-placeholder)]" weight="thin" />
          <p className="mt-4 text-[14px] text-[var(--color-text-muted)]">Payroll is available for organization workspaces.</p>
        </div>
    </div>
  );
}

// ─── Add Funds (Bank Transfer) ──────────────────────────────────────────

const CORRIDORS: Record<string, { label: string; flag: string }> = {
  NGN: { label: 'Nigeria · NGN', flag: '🇳🇬' },
  KES: { label: 'Kenya · KES', flag: '🇰🇪' },
  UGX: { label: 'Uganda · UGX', flag: '🇺🇬' },
  TZS: { label: 'Tanzania · TZS', flag: '🇹🇿' },
  MWK: { label: 'Malawi · MWK', flag: '🇲🇼' },
  BRL: { label: 'Brazil · BRL (PIX)', flag: '🇧🇷' },
};

function AddFundsButton() {
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState('NGN');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institution, setInstitution] = useState('');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [accountName, setAccountName] = useState('');
  const [step, setStep] = useState<'kyc' | 'form' | 'payment'>('kyc');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [accountResolved, setAccountResolved] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [startingKyc, setStartingKyc] = useState(false);
  const [checkingKyc, setCheckingKyc] = useState(false);

  const api = async (url: string, method = 'GET', body?: any) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}/${url.replace(/^\//, '')}`, {
      method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || `Request failed`);
    return j;
  };

  // Fetch KYC status and institutions on open
  useEffect(() => {
    if (!open) return;
    api('api/kyc/status').then(d => {
      setKycStatus(d.data?.status || 'not_started');
      if (d.data?.status === 'approved') setStep('form');
    }).catch(() => {});
    api(`api/onramp/institutions/${currency}`).then(d => setInstitutions(d.data || [])).catch(() => {});
  }, [currency, open]);

  // Fetch rate on amount change (debounced)
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) return;
    const t = setTimeout(async () => {
      try {
        const d = await api(`api/onramp/rate/base/USDC/${amount}/${currency}`);
        setRate(d.data?.rate || null);
      } catch { setRate(null); }
    }, 600);
    return () => clearTimeout(t);
  }, [amount, currency]);

  const handleStartKyc = async () => {
    setStartingKyc(true); setError(null);
    try {
      const d = await api('api/kyc/start', 'POST');
      if (d.data?.url) {
        setKycStatus('pending');
        window.open(d.data.url, '_blank');
      } else if (d.data?.status === 'approved') {
        setKycStatus('approved');
        setStep('form');
      } else {
        setError('Could not start verification. Try again.');
      }
    } catch (e: any) { setError(e.message); }
    finally { setStartingKyc(false); }
  };

  const handleCheckKyc = async () => {
    setCheckingKyc(true);
    try {
      const d = await api('api/kyc/check', 'POST');
      setKycStatus(d.data?.status || 'not_started');
      if (d.data?.status === 'approved') setStep('form');
    } catch { }
    finally { setCheckingKyc(false); }
  };

  const handleVerifyAccount = async () => {
    if (!accountIdentifier || !institution) return;
    setVerifyingAccount(true);
    try {
      const d = await api('api/onramp/verify-account', 'POST', {
        institution, accountIdentifier, currency,
      });
      if (d.data?.accountName) {
        setAccountName(d.data.accountName);
        setAccountResolved(true);
      }
    } catch {
      setAccountResolved(false);
    } finally {
      setVerifyingAccount(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!activeWorkspace) return;
    setLoading(true); setError(null);
    try {
      const d = await api('api/onramp/orders', 'POST', {
        workspaceId: activeWorkspace.id,
        amount, currency,
        refundAccount: { institution, accountIdentifier, accountName },
      });
      setOrder(d.data); setStep('payment');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const resetForm = () => { setOpen(false); setStep('kyc'); setAmount(''); setOrder(null); setError(null); };

  if (!activeWorkspace || activeWorkspace.type !== 'organization') return null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Coins className="h-4 w-4" weight="bold" /> Fund via Bank
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={resetForm}>
          <div className="relative w-full max-w-[440px] max-h-[90vh] flex flex-col rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]" onClick={e => e.stopPropagation()}>
            <button onClick={resetForm} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-secondary)]"><X className="h-4 w-4" weight="bold" /></button>
            <div className="border-b border-[var(--color-border)] px-6 py-5 pr-12 shrink-0">
              <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">{step === 'payment' ? 'Payment details' : step === 'kyc' ? 'Identity Verification' : 'Fund via Bank Transfer'}</h2>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {step === 'kyc' && (
                <>
                  <div className="flex flex-col items-center text-center pt-2 pb-4">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
                      <IdentificationCard className="h-8 w-8 text-[var(--color-primary)]" weight="bold" />
                    </div>
                    <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">Identity Verification</h3>
                    <p className="mt-2 text-[13px] text-[var(--color-text-muted)] max-w-[320px]">
                      To fund via bank transfer, we need to verify your identity first.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                      <span className="text-[13px] text-[var(--color-foreground)]">Takes about 2-3 minutes</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                      <span className="text-[13px] text-[var(--color-foreground)]">Have your ID ready</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                      <span className="text-[13px] text-[var(--color-foreground)]">Results usually instant</span>
                    </div>
                  </div>

                  {kycStatus === 'pending' && (
                    <div className="rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] p-4 text-center">
                      <p className="text-[13px] font-medium text-[var(--color-warning)]">Verification in progress</p>
                      <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Complete the verification in the opened tab, then check your status below.</p>
                    </div>
                  )}

                  {(kycStatus === 'rejected' || kycStatus === 'retry_required') && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-center">
                      <Warning className="mx-auto h-8 w-8 text-red-500 mb-2" weight="bold" />
                      <p className="text-[13px] font-medium text-red-700 dark:text-red-400">Verification failed</p>
                      <p className="mt-1 text-[12px] text-red-600/70 dark:text-red-400/70">Please try again with clear photos of your documents.</p>
                    </div>
                  )}

                  {kycStatus === 'approved' && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center">
                      <CheckCircle className="mx-auto h-8 w-8 text-emerald-500 mb-2" weight="bold" />
                      <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">Verification approved</p>
                      <p className="mt-1 text-[12px] text-emerald-600/70 dark:text-emerald-400/70">You can now fund via bank transfer.</p>
                    </div>
                  )}

                  {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
                </>
              )}

              {step === 'form' && (
                <>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Currency</span>
                    <select value={currency} onChange={e => setCurrency(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]">
                      {Object.entries(CORRIDORS).map(([k, v]) => (<option key={k} value={k}>{v.flag} {v.label}</option>))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Amount ({currency})</span>
                    <input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[14px] tabular-nums text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]" />
                    {rate && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">≈ {rate} USDC</p>}
                  </div>

                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Where to refund if payment fails</p>
                    {currency !== 'BRL' ? (
                      <>
                        <select value={institution} onChange={e => { setInstitution(e.target.value); setAccountResolved(false); }} className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]">
                          <option value="">Select institution</option>
                          {institutions.map((i: any) => (<option key={i.code || i.id} value={i.code || i.id}>{i.name || i.label}</option>))}
                        </select>
                      </>
                    ) : (
                      <p className="mb-2 text-[12px] text-[var(--color-text-muted)]">PIX key (CPF, email, phone, or random key)</p>
                    )}
                    <input
                      type="text"
                      placeholder={currency === 'BRL' ? 'PIX key' : 'Account number'}
                      value={accountIdentifier}
                      onChange={e => { setAccountIdentifier(e.target.value); setAccountResolved(false); }}
                      onBlur={handleVerifyAccount}
                      className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
                    />
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Account name"
                        value={verifyingAccount ? 'Verifying...' : accountName}
                        readOnly={accountResolved}
                        onChange={e => setAccountName(e.target.value)}
                        className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] ${accountResolved ? 'opacity-70' : ''}`}
                      />
                      {verifyingAccount && (
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
                </>
              )}

              {step === 'payment' && order && (
                <>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Bank</p>
                    <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">{order.providerAccount?.accountName || '—'}</p>
                    <div className="mt-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
                      <p className="text-[24px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{order.providerAccount?.accountIdentifier || '—'}</p>
                      <button onClick={() => navigator.clipboard.writeText(order.providerAccount?.accountIdentifier || '')} className="mt-1 text-[11px] text-[var(--color-primary)] hover:underline">Copy</button>
                    </div>
                    <p className="mt-3 text-[11px] font-bold text-[var(--color-warning)]">Transfer EXACTLY {order.providerAccount?.amountToTransfer} {order.providerAccount?.currency}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Status: Waiting for deposit</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4 shrink-0">
              {step === 'kyc' && (
                <>
                  <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
                  {kycStatus === 'approved' ? (
                    <Button variant="default" size="sm" onClick={() => setStep('form')}>
                      Continue <ArrowRight className="ml-1 h-4 w-4" weight="bold" />
                    </Button>
                  ) : kycStatus === 'pending' ? (
        <Button variant="default" size="sm" disabled={checkingKyc} onClick={handleCheckKyc}>
          Check status
        </Button>
      ) : (
        <Button variant="default" size="sm" disabled={startingKyc} onClick={handleStartKyc}>
                      Start verification
                    </Button>
                  )}
                </>
              )}
              {step === 'form' && (
                <>
                  <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
                  <Button variant="default" size="sm" disabled={!amount || !accountIdentifier || loading} onClick={handleCreateOrder}>{loading ? 'Creating...' : 'Get payment details'}</Button>
                </>
              )}
              {step === 'payment' && (
                <Button variant="default" size="sm" onClick={resetForm}>Done</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

  const statItems: AttachedStatCardItem[] = [
    { id: 'balance', title: 'Treasury balance', value: `$${treasury?.balanceUsd ?? '—'}`, helper: treasury?.testnet ? 'Base Sepolia (testnet)' : 'Available USDC on Base', icon: Coins },
    { id: 'reserved', title: 'Reserved for payroll', value: `$${treasury?.reservedUsd ?? '—'}`, helper: 'Pending payroll obligations', icon: ArrowDown, valueClassName: parseFloat(treasury?.reservedUsd || '0') > 0 ? 'text-[var(--color-warning)]' : undefined, iconClassName: parseFloat(treasury?.reservedUsd || '0') > 0 ? 'text-[var(--color-warning)]' : undefined },
    { id: 'available', title: 'Available to pay', value: `$${treasury?.availableUsd ?? '—'}`, helper: 'Ready for payroll', icon: Check, valueClassName: 'text-[var(--color-success)]', iconClassName: 'text-[var(--color-success)]' },
  ];

  const previewTimer = !preview ? null : timeLeft <= 0
    ? <span className="text-[var(--color-danger)] font-semibold">Expired</span>
    : <span className="font-semibold text-[var(--color-warning)]">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--color-foreground)]">Payroll</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">Treasury balance, receive payments, and run payroll.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => {
            if (treasury?.treasuryAddress) {
              fundWallet({ address: treasury.treasuryAddress, options: { chain: { id: treasury?.testnet ? 84532 : 8453 } as any } });
            }
          }}>
            <ShareNetwork className="h-4 w-4" weight="bold" /> Receive
          </Button>
          <AddFundsButton />
          <Button variant="secondary" size="sm" onClick={() => setOfframpOpen(true)}>
            <ArrowDown className="h-4 w-4" weight="bold" /> Withdraw
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setPayrollOpen(true); setPayrollView('form'); setRunResult(null); setError(null); }}>
            <Coins className="h-4 w-4" weight="bold" /> Run Payroll
          </Button>
          <Button variant="secondary" size="sm" onClick={openCreateSchedule}>
            <ArrowsClockwise className="h-4 w-4" weight="bold" /> New Schedule
          </Button>
        </div>
      </div>

      {/* Stat grid */}
      <AttachedStatGrid items={statItems} className="grid-cols-1 sm:grid-cols-3" />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-[var(--color-surface-tertiary)] p-1 w-fit">
        {([
          { key: 'history' as const, label: 'History' },
          { key: 'scheduled' as const, label: 'Scheduled' },
        ]).map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
              mainTab === t.key ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Run Payroll modal ── */}
      {payrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closePayrollDialog}>
          <div className="relative w-full max-w-[480px] max-h-[90vh] flex flex-col rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]" onClick={e => e.stopPropagation()}>
            <button onClick={closePayrollDialog} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-secondary)]">
              <X className="h-4 w-4" weight="bold" />
            </button>
            <div className="border-b border-[var(--color-border)] px-6 py-5 pr-12 shrink-0">
              <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">{payrollView === 'preview' ? 'Confirm Payroll' : 'Run Payroll'}</h2>
            </div>

            {payrollView === 'form' && (
              <>
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Team members</span>
                      {loadingMembers && <span className="text-[11px] text-[var(--color-text-muted)] animate-pulse">Loading…</span>}
                    </div>
                    {loadingMembers ? (
                      [...Array(4)].map((_, i) => (<div key={i} className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2.5 mb-1.5"><div className="h-7 w-7 animate-pulse rounded-full bg-[var(--color-surface-tertiary)]" /><div className="flex-1 space-y-1"><div className="h-3 w-20 animate-pulse rounded bg-[var(--color-surface-tertiary)]" /><div className="h-2.5 w-12 animate-pulse rounded bg-[var(--color-surface-tertiary)]" /></div><div className="h-8 w-20 animate-pulse rounded-lg bg-[var(--color-surface-tertiary)]" /></div>))
                    ) : membersWithoutOwner.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-6 text-center"><UsersThree className="h-6 w-6 text-[var(--color-text-muted)]" weight="duotone" /><p className="text-[12px] text-[var(--color-text-muted)]">No team members yet.</p></div>
                    ) : (
                      membersWithoutOwner.map(m => (
                        <MemberRow key={m.userId} member={m} amount={amounts[m.userId] || ''} onAmount={setAmt} />
                      ))
                    )}
                  </div>
                  {error && <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4 shrink-0">
                  <Button variant="ghost" size="sm" onClick={closePayrollDialog}>Cancel</Button>
                  <Button variant="default" size="sm" onClick={handlePreview} disabled={loadingMembers || loadingPreview}>
                    {loadingPreview ? <><ArrowsClockwise className="h-3.5 w-3.5 animate-spin" weight="bold" /> Calculating…</> : 'Preview Payroll'}
                  </Button>
                </div>
              </>
            )}

            {payrollView === 'preview' && preview && (
              <>
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Total going out</p>
                    <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">${fmtUsd(preview.totalUsdc)}</p>
                    <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Treasury after payroll: <span className="font-semibold text-[var(--color-foreground)]">${fmtUsd(preview.treasuryBalanceAfter)}</span></p>
                    <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">Expires in {previewTimer}</p>
                    <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">Gas fees are covered by the treasury balance.</p>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5"><span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Breakdown</span></div>
                    <div className="divide-y divide-[var(--color-surface-secondary)]">{preview.items.map(item => (<div key={item.userId} className="flex items-center justify-between px-4 py-2.5"><p className="text-[12px] font-semibold text-[var(--color-foreground)]">{item.name}</p><p className="text-[12px] font-semibold tabular-nums text-[var(--color-foreground)]">${item.amountUsd}</p></div>))}</div>
                  </div>
                  {runResult && (<div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5"><Check className="h-4 w-4 text-[var(--color-success)]" weight="bold" /><p className="text-[12px] font-medium text-[var(--color-foreground)]">{runResult.successCount} succeeded{runResult.failedCount > 0 ? `, ${runResult.failedCount} failed` : ''}</p></div>)}
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4 shrink-0">
                  {!runResult ? (<><Button variant="ghost" size="sm" onClick={() => { setPayrollView('form'); setPreview(null); }}>Back</Button>{timeLeft > 0 ? <Button variant="default" size="sm" onClick={handleRun} disabled={running}>{running ? <><ArrowsClockwise className="h-3.5 w-3.5 animate-spin" weight="bold" /> Running…</> : 'Confirm & Run'}</Button> : <Button variant="default" size="sm" disabled className="opacity-50">Preview expired</Button>}</>) : <Button variant="default" size="sm" onClick={closePayrollDialog}>Done</Button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Schedule creation modal ── */}
      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setScheduleOpen(false)}>
          <div className="relative w-full max-w-[480px] max-h-[90vh] flex flex-col rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setScheduleOpen(false)} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-secondary)]">
              <X className="h-4 w-4" weight="bold" />
            </button>
            <div className="border-b border-[var(--color-border)] px-6 py-5 pr-12 shrink-0">
              <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</h2>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Frequency</span>
                <div className="mt-2 flex gap-1 rounded-xl bg-[var(--color-surface-tertiary)] p-1 w-fit">
                  {(['minute', 'weekly', 'biweekly', 'monthly'] as const).map(f => (
                    <button key={f} onClick={() => setSchedFreq(f)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${schedFreq === f ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]'}`}>{f === 'minute' ? 'Test (1 min)' : f}</button>
                  ))}
                </div>
              </div>
              {schedFreq === 'monthly' && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Day of month</span>
                  <div className="mt-2 flex gap-1 rounded-xl bg-[var(--color-surface-tertiary)] p-1 w-fit flex-wrap">
                    {[1, 15, 25, 28].map(d => (
                      <button key={d} onClick={() => setSchedDayOfMonth(d)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${schedDayOfMonth === d ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]'}`}>{d}th</button>
                    ))}
                  </div>
                </div>
              )}
              {(schedFreq === 'weekly' || schedFreq === 'biweekly') && (
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Day of week</span>
                  <div className="mt-2 flex gap-1 rounded-xl bg-[var(--color-surface-tertiary)] p-1 w-fit flex-wrap">
                    {(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const).map((d, i) => (
                      <button key={d} onClick={() => setSchedDayOfWeek(i)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${schedDayOfWeek === i ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-foreground)]'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Team members</span>
                <div className="mt-2 space-y-1.5">
                  {membersWithoutOwner.map(m => {
                    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || m.userId;
                    return (
                      <div key={m.userId} className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[11px] font-semibold text-[var(--color-text-secondary)]">{(name[0] || '?').toUpperCase()}</div>
                        <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-[var(--color-foreground)]">{name}</p><p className="text-[10px] text-[var(--color-text-muted)] capitalize">{m.role}</p></div>
                        <div className="flex items-center gap-1"><span className="text-[12px] text-[var(--color-text-muted)]">$</span><input type="text" inputMode="decimal" placeholder="0.00" value={schedAmounts[m.userId] || ''} onChange={e => setSchedAmounts(p => ({ ...p, [m.userId]: e.target.value }))} className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-right text-[12px] tabular-nums text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]" /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {schedError && <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{schedError}</p></div>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => { setScheduleOpen(false); setEditingSchedule(null); }}>Cancel</Button>
              <Button variant="default" size="sm" disabled={schedSaving} onClick={async () => {
                const items = Object.entries(schedAmounts).filter(([, v]) => v && parseFloat(v) > 0).map(([userId, amount]) => ({ userId, amountUsdc: (parseFloat(amount) * 1e6).toString() }));
                if (!items.length) { setSchedError('Enter at least one amount'); return; }
                setSchedSaving(true); setSchedError(null);
                try {
                  if (editingSchedule) {
                    await api(`/api/workspaces/${activeWorkspace.id}/payroll/schedule/${editingSchedule.id}`, 'PATCH', {
                      frequency: schedFreq, dayOfMonth: schedFreq === 'monthly' ? schedDayOfMonth : null,
                      dayOfWeek: schedFreq !== 'monthly' ? schedDayOfWeek : null, items,
                    });
                  } else {
                    await api(`/api/workspaces/${activeWorkspace.id}/payroll/schedule`, 'POST', {
                      frequency: schedFreq, dayOfMonth: schedFreq === 'monthly' ? schedDayOfMonth : null,
                      dayOfWeek: schedFreq !== 'monthly' ? schedDayOfWeek : null, items,
                    });
                  }
                  setSchedAmounts({}); setEditingSchedule(null); setScheduleOpen(false); refreshSchedules();
                } catch (e: any) { setSchedError(e.message); }
                finally { setSchedSaving(false); }
              }}>{schedSaving ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Create Schedule'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── History table ── */}
      {mainTab === 'history' && (
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Payroll history</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Past payroll runs and their per-member breakdown.</p>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_90px_100px_90px] gap-3 border-b border-[var(--color-surface-tertiary)] px-5 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Run</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Recipients</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Amount</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Date</span>
        </div>

        {loadingHistory ? (
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-[var(--color-surface-tertiary)]" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Coins className="h-8 w-8 text-[var(--color-border-input)]" weight="duotone" />
            <p className="text-[13px] text-[var(--color-text-muted)]">No payroll runs yet. Run your first payroll to see it here.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {history.map(run => (
              <div key={run.id}>
                <button type="button"
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  className="grid w-full grid-cols-[1fr_90px_100px_90px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]">
                      {run.runType === 'fixed' ? <Coins className="h-4 w-4" weight="bold" /> : <Check className="h-4 w-4" weight="bold" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold capitalize text-[var(--color-foreground)]">{run.runType} payroll</p>
                      <div className="flex items-center gap-1.5">
                        {run.scheduledPayrollId && (
                          <span className="inline-block rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 dark:text-blue-400">Scheduled</span>
                        )}
                        <p className="text-[11px] text-[var(--color-text-muted)]">{run.initiatedBy.name}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[12px] font-medium text-[var(--color-text-muted)]">{run.itemCount}</p>
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">${run.totalAmountUsd}</p>
                  <div className="flex items-center justify-end gap-1.5 relative">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${statusPill(run.status)}`}>
                      {run.status === 'partial_failed' ? 'Partial' : run.status.replace('_', ' ')}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === run.id ? null : run.id); }} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-secondary)]">
                      <DotsThreeOutline className="h-4 w-4" weight="bold" />
                    </button>
                    {openMenuId === run.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 min-w-[100px] rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xl py-1" onClick={(e) => e.stopPropagation()}>
                        <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--color-surface-secondary)] text-red-600" onClick={async () => {
                          setHistory(prev => prev.filter(x => x.id !== run.id));
                          await api(`/api/workspaces/${activeWorkspace.id}/payroll/history/${run.id}`, 'DELETE');
                        }}>Delete</button>
                      </div>
                    )}
                    {expandedRun === run.id ? <CaretDown className="h-3 w-3 text-[var(--color-text-muted)]" weight="bold" /> : <CaretRight className="h-3 w-3 text-[var(--color-text-muted)]" weight="bold" />}
                  </div>
                </button>

                {expandedRun === run.id && (
                  <div className="border-t border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-5 py-3">
                    <div className="space-y-1.5">
                      {run.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-[var(--color-foreground)]">{item.recipientName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusPill(item.status)}`}>{item.status.replace('_', ' ')}</span>
                              {item.txHash && (
                                <a href={BASESCAN_TX(item.txHash)} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-[var(--color-primary)] hover:underline">
                                  Basescan <ArrowSquareOut className="h-2.5 w-2.5" weight="bold" />
                                </a>
                              )}
                            </div>
                          </div>
                          <p className="text-[12px] font-semibold tabular-nums text-[var(--color-foreground)]">${item.amountUsd}</p>
                        </div>
                      ))}
                    </div>
                    {run.status === 'partial_failed' && (
                      <Button variant="outline" size="sm" className="mt-3 w-full"
                        onClick={e => { e.stopPropagation(); handleRetry(run.id); }}
                        disabled={retrying === run.id}>
                        {retrying === run.id ? <><ArrowsClockwise className="h-3.5 w-3.5 animate-spin" weight="bold" /> Retrying…</> : 'Retry failed payments'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loadingHistory && historyTotal > 20 && (
          <div className="flex items-center justify-center gap-2 border-t border-[var(--color-border)] px-5 py-3">
            <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={historyPage * 20 >= historyTotal} onClick={() => setHistoryPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </div>
      )}

      {/* ── Scheduled list ── */}
      {mainTab === 'scheduled' && (
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Scheduled payroll</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Recurring payroll runs. Next run dates shown in UTC.</p>
          </div>
        </div>
        {loadingSchedules ? (
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {[...Array(2)].map((_, i) => (<div key={i} className="h-16 animate-pulse bg-[var(--color-surface-tertiary)]" />))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ArrowsClockwise className="h-8 w-8 text-[var(--color-border-input)]" weight="duotone" />
            <p className="text-[13px] text-[var(--color-text-muted)]">No scheduled payrolls yet. Create one to automate your payroll.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {schedules.map(s => {
              const freqLabel = s.frequency === 'monthly' ? `Monthly · ${s.dayOfMonth || '?'}th`
                : s.frequency === 'minute' ? 'Every minute (test)'
                : s.frequency === 'biweekly' ? `Biweekly (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfWeek ?? 1]})`
                : `Weekly (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfWeek ?? 1]})`;
              return (
                <div key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{freqLabel}</p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Next: {new Date(s.nextRunAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at 09:00 UTC
                      {s.status === 'paused' ? ' · Paused' : ''}
                      {s.status === 'cancelled' ? ' · Cancelled' : ''}
                      {' · '}{s.itemCount} member(s) · ${s.totalUsd}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 relative">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>{s.status}</span>
                    <button onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-secondary)]">
                      <DotsThreeOutline className="h-4 w-4" weight="bold" />
                    </button>
                    {openMenuId === s.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 min-w-[120px] rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xl py-1" onClick={() => setOpenMenuId(null)}>
                        <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]" onClick={() => { openEditSchedule(s); }}>Edit</button>
                        {s.status === 'active' && (
                          <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]" onClick={async () => { setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, status: 'paused' } : x)); await api(`/api/workspaces/${activeWorkspace.id}/payroll/schedule/${s.id}`, 'PATCH', { status: 'paused' }); }}>Pause</button>
                        )}
                        {s.status === 'paused' && (
                          <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]" onClick={async () => { setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, status: 'active' } : x)); await api(`/api/workspaces/${activeWorkspace.id}/payroll/schedule/${s.id}`, 'PATCH', { status: 'active' }); }}>Resume</button>
                        )}
                        <button className="w-full text-left px-4 py-2 text-[13px] hover:bg-[var(--color-surface-secondary)] text-red-600" onClick={async () => { setSchedules(prev => prev.filter(x => x.id !== s.id)); await api(`/api/workspaces/${activeWorkspace.id}/payroll/schedule/${s.id}`, 'DELETE'); }}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
      <OfframpModal
        open={offrampOpen}
        onClose={() => setOfframpOpen(false)}
        source="workspace"
        workspaceId={activeWorkspace?.id || ''}
        returnAddress={treasury?.treasuryAddress || ''}
        maxAmount={parseFloat(treasury?.availableUsd?.replace(/[^0-9.]/g, '') || '0')}
      />
    </div>
  );
}
