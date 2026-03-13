import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { PaymentsClient } from './view';

export default async function PaymentsPage() {
  const session = await getCurrentSession();
  const data = await hedwigApi.payments({ accessToken: session.accessToken });

  return <PaymentsClient invoices={data.invoices} paymentLinks={data.paymentLinks} />;
}
