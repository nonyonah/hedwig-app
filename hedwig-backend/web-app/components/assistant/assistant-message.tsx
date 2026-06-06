'use client';

import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

export function AssistantMessage({ content }: { content: string }) {
  const html = useMemo(() => md.render(content), [content]);

  return (
    <div
      className="prose prose-sm max-w-none text-[14px] leading-relaxed text-[var(--color-foreground)] [&_a]:text-[var(--color-accent)] [&_a]:underline [&_a]:hover:text-[var(--color-primary-dark)] [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-[var(--color-surface-tertiary)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono [&_pre]:rounded-lg [&_pre]:bg-[var(--color-surface-tertiary)] [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:font-mono [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[14px] [&_h3]:font-semibold"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
