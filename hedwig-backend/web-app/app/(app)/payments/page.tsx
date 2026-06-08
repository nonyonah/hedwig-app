import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { invoices as mockInvoices, paymentLinks as mockPaymentLinks, invoiceDrafts, paymentLinkDrafts, clients as mockClients } from '@/lib/mock/data';
import { PaymentsClient } from './view';

export default async function PaymentsPage({
  searchParams
}: {
  searchParams?: Promise<{ invoice?: string; paymentLink?: string; recurring?: string; create?: string }>;
}) {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  let data = { invoices: mockInvoices, paymentLinks: mockPaymentLinks, invoiceDrafts, paymentLinkDrafts };
  try {
    data = await hedwigApi.payments(opts);
  } catch {
    // Fall back to mock payments if the API call fails
  }

  const [recurringInvoices, clients] = await Promise.all([
    hedwigApi.recurringInvoices(opts).catch(() => []),
    hedwigApi.clients(opts).catch(() => mockClients),
  ]);
  const billing = await hedwigApi.billingStatus(opts).catch(() => null);

  const params = (await searchParams) ?? {};

  const createAction =
    params.create === 'invoice' || params.create === 'payment-link'
      ? (params.create as 'invoice' | 'payment-link')
      : undefined;

  return (
    <PaymentsClient
      key={opts.workspaceId ?? 'default'}
      accessToken={session.accessToken}
      highlightedInvoiceId={params.invoice ?? null}
      highlightedPaymentLinkId={params.paymentLink ?? null}
      highlightedRecurringId={params.recurring ?? null}
      createAction={createAction}
      invoices={data.invoices}
      paymentLinks={data.paymentLinks}
      recurringInvoices={recurringInvoices}
      clients={clients}
      billing={billing}
    />
  );
}
