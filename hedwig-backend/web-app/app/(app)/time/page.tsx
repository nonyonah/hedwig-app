import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { TimeView } from './view';

export default async function TimePage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);

  const [entriesRes, activeRes, summaryRes] = await Promise.all([
    hedwigApi.timeEntries(undefined, opts).catch(() => ({ entries: [] })),
    hedwigApi.timeEntryActive(opts).catch(() => ({ entry: null })),
    hedwigApi.timeSummary(opts).catch(() => ({
      summary: { hoursToday: 0, hoursThisWeek: 0, hoursThisMonth: 0, billableAmount: 0, topClient: null, topProject: null },
    })),
  ]);

  return (
    <TimeView
      key={opts.workspaceId ?? 'default'}
      accessToken={session.accessToken}
      initialEntries={entriesRes.entries || []}
      initialActiveEntry={activeRes.entry || null}
      initialSummary={summaryRes.summary}
    />
  );
}
