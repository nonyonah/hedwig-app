import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { PaymentsClient } from './view';

export default async function PaymentsPage({
  searchParams
}: {
  searchParams?: Promise<{ invoice?: string }>;
}) {
  const session = await getCurrentSession();
  const data = await hedwigApi.payments({ accessToken: session.accessToken });
  const params = (await searchParams) ?? {};

  return (
    <PaymentsClient
      accessToken={session.accessToken}
      highlightedInvoiceId={params.invoice ?? null}
      invoices={data.invoices}
      paymentLinks={data.paymentLinks}
    />
  );
}
