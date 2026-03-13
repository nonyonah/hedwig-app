import { AuthHintCard } from '@/components/providers/auth-gate';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <AuthHintCard />
      </div>
    </main>
  );
}
