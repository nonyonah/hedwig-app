'use client';

import { ImportDocumentReviewFlow } from '@/components/import-review/import-document-review-flow';

export function ImportReviewPageClient({ accessToken }: { accessToken: string | null }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] px-6 py-10">
      <ImportDocumentReviewFlow mode="page" accessToken={accessToken} />
    </div>
  );
}
