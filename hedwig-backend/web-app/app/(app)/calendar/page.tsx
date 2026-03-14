import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { CalendarClient } from './view';

export default async function CalendarPage({
  searchParams
}: {
  searchParams?: Promise<{ reminder?: string }>;
}) {
  const session = await getCurrentSession();
  const data = await hedwigApi.calendar({ accessToken: session.accessToken });
  const params = (await searchParams) ?? {};

  return <CalendarClient accessToken={session.accessToken} data={data} selectedReminderId={params.reminder ?? null} />;
}
