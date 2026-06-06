'use client';

import { ImportDocumentReviewFlow } from '@/components/import-review/import-document-review-flow';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';

export function ImportReviewPageClient({ accessToken }: { accessToken: string | null }) {
  useAssistantPageContext('Imports');
  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] px-6 py-10">
      <ImportDocumentReviewFlow mode="page" accessToken={accessToken} />
    </div>
  );
}
