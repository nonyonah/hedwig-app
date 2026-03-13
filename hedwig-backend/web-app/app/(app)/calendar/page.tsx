import { ListCard } from '@/components/data/list-card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatShortDate } from '@/lib/utils';

export default async function CalendarPage() {
  const session = await getCurrentSession();
  const data = await hedwigApi.calendar({ accessToken: session.accessToken });

  return (
    <div>
      <PageHeader
        eyebrow="Calendar"
        title="Deadlines, milestones, and payment timing"
        description="This timeline centers what matters to freelancers: due work, due money, and the tasks that protect both."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <ListCard title="Reminders" items={data.reminders.map((item) => ({ id: item.id, title: item.title, meta: formatShortDate(item.dueAt) }))} />
        <ListCard title="Milestones" items={data.milestones.map((item) => ({ id: item.id, title: item.name, subtitle: item.status, meta: formatShortDate(item.dueAt) }))} />
        <ListCard title="Invoice due dates" items={data.invoices.map((invoice) => ({ id: invoice.id, title: invoice.number, subtitle: invoice.status, meta: formatShortDate(invoice.dueAt) }))} />
      </div>
    </div>
  );
}
