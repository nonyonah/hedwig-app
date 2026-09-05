import { redirect } from 'next/navigation';

// Clients hidden from nav (page kept for a future return).
export default async function ClientsPage() {
  redirect('/dashboard');
}
