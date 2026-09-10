import { redirect } from 'next/navigation';

// Revenue settings retired with the Revenue page — preferences live in Settings.
export default async function RevenueSettingsPage() {
  redirect('/insights');
}
