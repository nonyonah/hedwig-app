import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { invoices as mockInvoices, paymentLinks as mockPaymentLinks, invoiceDrafts, paymentLinkDrafts } from '@/lib/mock/data';
import { PaymentsClient } from './view';

export default async function PaymentsPage({
  searchParams
}: {
  searchParams?: Promise<{ invoice?: string }>;
}) {
  const session = await getCurrentSession();
  let data = { invoices: mockInvoices, paymentLinks: mockPaymentLinks, invoiceDrafts, paymentLinkDrafts };
  try {
    data = await hedwigApi.payments({ accessToken: session.accessToken });
  } catch {
    // Fall back to mock payments if the API call fails
  }
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
