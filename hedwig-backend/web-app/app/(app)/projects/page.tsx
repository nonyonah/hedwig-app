import { redirect } from 'next/navigation';

// Projects hidden from nav (page kept for a future return).
export default async function ProjectsPage() {
  redirect('/dashboard');
}
