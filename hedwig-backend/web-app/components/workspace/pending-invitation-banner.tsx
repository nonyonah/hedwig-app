'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Envelope } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';

interface PendingInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  token: string;
  expiresAt: string;
}

export function PendingInvitationBanner() {
  const { accessToken } = useWorkspaceContext();
  const router = useRouter();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetch(`${backendConfig.apiBaseUrl}/api/workspaces/my-invitations`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
      .then((res) => res.json())
      .then((body) => {
        setInvites(body.data?.invitations || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (loading || invites.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary-dark)]">
          <Envelope className="h-4 w-4" weight="bold" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
            You have {invites.length} pending workspace invitation{invites.length > 1 ? 's' : ''}
          </p>
          <div className="mt-2 space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg bg-[var(--color-surface)] p-3">
                <div>
                  <p className="text-[13px] font-medium text-[var(--color-foreground)]">
                    {inv.workspaceName}
                  </p>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">
                    {inv.role === 'admin' ? 'Admin' : 'Member'} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => router.push(`/join?token=${inv.token}`)}
                >
                  Accept
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
