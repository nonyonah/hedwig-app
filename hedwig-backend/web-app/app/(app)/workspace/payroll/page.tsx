import { Metadata } from 'next';
import { PayrollDashboard } from '@/components/workspace/payroll-dashboard';

export const metadata: Metadata = {
  title: 'Payroll - Hedwig',
  description: 'Treasury balance, run payroll, and view payment history.',
};

export default function PayrollPage() {
  return <PayrollDashboard />;
}
