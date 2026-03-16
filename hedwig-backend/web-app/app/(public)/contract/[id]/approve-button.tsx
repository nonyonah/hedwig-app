'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function ApproveContractButton({ contractId }: { contractId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApprove = async () => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Approval token is missing from this link.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/backend/api/documents/approve/${contractId}/${token}`, {
        cache: 'no-store'
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
        throw new Error(message || 'Approval failed');
      }

      router.replace(`/contract/${contractId}?approved=true`);
      router.refresh();
    } catch (error: any) {
      setError(error?.message || 'Failed to approve contract');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleApprove}
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-full bg-[#2563eb] px-5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Approving…' : 'Approve contract'}
      </button>
      {error ? (
        <div className="rounded-2xl border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-[13px] text-[#b42318]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
