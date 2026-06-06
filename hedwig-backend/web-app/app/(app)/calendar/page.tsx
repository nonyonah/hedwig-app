import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { reminders as mockReminders, milestones as mockMilestones, invoices as mockInvoices, projects as mockProjects } from '@/lib/mock/data';
import { CalendarClient } from './view';

export default async function CalendarPage({
  searchParams
}: {
  searchParams?: Promise<{ reminder?: string }>;
}) {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  let data = { reminders: mockReminders, milestones: mockMilestones, invoices: mockInvoices, projects: mockProjects };
  try {
    data = await hedwigApi.calendar(opts);
  } catch {
    // Fall back to mock calendar if the API call fails
  }
  const params = (await searchParams) ?? {};

  return (
    <CalendarClient
      key={opts.workspaceId ?? 'default'}
      accessToken={session.accessToken}
      data={data}
      selectedReminderId={params.reminder ?? null}
    />
  );
}
