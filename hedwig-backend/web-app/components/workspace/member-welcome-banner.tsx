'use client';

import { Alert } from '@heroui/react';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

export function MemberWelcomeBanner() {
  const { activeWorkspace } = useWorkspaceContext();

  if (!activeWorkspace || activeWorkspace.role !== 'member') return null;

  return (
    <div className="mb-6">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Welcome to {activeWorkspace.name}</Alert.Title>
          <Alert.Description>
            You are a member of this workspace. Once an admin assigns you to projects, you will see your tasks, payouts, and project details here.
          </Alert.Description>
          <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
            In the meantime, you can view workspace members under{' '}
            <strong>Workspace settings</strong>.
          </p>
        </Alert.Content>
      </Alert>
    </div>
  );
}
