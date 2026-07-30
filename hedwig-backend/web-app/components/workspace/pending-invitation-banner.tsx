'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@heroui/react';
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
    <div className="mb-6">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            You have {invites.length} pending workspace invitation{invites.length > 1 ? 's' : ''}
          </Alert.Title>
          <div className="mt-3 space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5"
              >
                <div>
                  <p className="text-[13px] font-medium text-[var(--color-foreground)]">
                    {inv.workspaceName}
                  </p>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">
                    {inv.role === 'admin' ? 'Admin' : 'Member'} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => router.push(`/join?token=${inv.token}`)}
                >
                  Accept
                </Button>
              </div>
            ))}
          </div>
        </Alert.Content>
      </Alert>
    </div>
  );
}
