import { redirect } from 'next/navigation';

// Reports merged into Insights (financial timeline section).
export default async function ReportsPage() {
  redirect('/insights');
}
