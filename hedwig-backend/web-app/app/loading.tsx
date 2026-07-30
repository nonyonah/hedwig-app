import { Loader } from '@/components/ui/loader';

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-surface)]">
      <Loader size={20} />
    </div>
  );
}
