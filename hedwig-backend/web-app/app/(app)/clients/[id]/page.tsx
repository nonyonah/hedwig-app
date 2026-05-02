import { notFound } from 'next/navigation';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { ClientDetailClient } from './view';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const data = await hedwigApi.client(id, {
    accessToken: session.accessToken,
    disableMockFallback: true
  });

  if (!data.client) notFound();

  return (
    <ClientDetailClient
      accessToken={session.accessToken}
      contracts={data.contracts}
      initialClient={data.client}
      invoices={data.invoices}
      paymentLinks={data.paymentLinks}
      projects={data.projects}
    />
  );
}
