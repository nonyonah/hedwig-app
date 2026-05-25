import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';

export default async function PricingPage() {
  const session = await getCurrentSession();
  redirect(session.accessToken ? '/dashboard' : '/');
}
