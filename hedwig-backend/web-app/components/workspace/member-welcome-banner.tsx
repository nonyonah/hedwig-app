'use client';

import { UserPlus } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

export function MemberWelcomeBanner() {
  const { activeWorkspace } = useWorkspaceContext();

  if (!activeWorkspace || activeWorkspace.role !== 'member') return null;

  return (
    <div className="mb-6 rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary-dark)]">
          <UserPlus className="h-4 w-4" weight="bold" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
            Welcome to {activeWorkspace.name}
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
            You are a member of this workspace. Once an admin assigns you to projects,
            you will see your tasks, payouts, and project details here.
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
            In the meantime, you can view workspace members under{' '}
            <strong>Workspace settings</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
