import { redirect } from 'next/navigation';

// Revenue overview merged into Insights — sub-pages (transactions, reports,
// settings) remain live under /revenue/*.
export default async function RevenuePage() {
  redirect('/insights');
}
