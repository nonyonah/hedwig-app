import { ProtectedShell } from '@/components/app-shell/protected-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
