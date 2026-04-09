'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MagicWand, Sparkle } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import type { InvoiceDraft, PaymentLinkDraft } from '@/lib/models/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

const schema = z.object({
  mode: z.enum(['invoice', 'payment-link']),
  prompt: z.string().min(12, 'Describe what should be created in natural language.')
});

type ComposerValues = z.infer<typeof schema>;

export function PromptComposer({ onDraft }: { onDraft: (draft: { invoiceDraft?: InvoiceDraft | null; paymentLinkDraft?: PaymentLinkDraft | null }) => void; }) {
  const [loading, setLoading] = useState(false);
  const form = useForm<ComposerValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: 'invoice',
      prompt: ''
    }
  });

  const mode = form.watch('mode');

  const submit = form.handleSubmit(async (values) => {
    setLoading(true);
    try {
      if (values.mode === 'invoice') {
        const draft = await hedwigApi.createInvoiceDraft(values.prompt);
        onDraft({ invoiceDraft: draft, paymentLinkDraft: null });
      } else {
        const draft = await hedwigApi.createPaymentLinkDraft(values.prompt);
        onDraft({ invoiceDraft: null, paymentLinkDraft: draft });
      }
    } finally {
      setLoading(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-[#72706b]">
          <Sparkle className="h-4 w-4" weight="bold" />
          <span className="text-xs font-semibold uppercase tracking-[0.24em]">AI actions</span>
        </div>
        <CardTitle>Create billing flows from prompts</CardTitle>
        <CardDescription>
          AI helps draft structured invoices and payment links, but confirmation stays inside the workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="inline-flex rounded-[15px] border border-border/80 bg-white p-1 shadow-soft text-sm">
          <button
            className={`rounded-[15px] px-4 py-2 font-semibold ${mode === 'invoice' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            onClick={() => form.setValue('mode', 'invoice')}
            type="button"
          >
            Invoice
          </button>
          <button
            className={`rounded-[15px] px-4 py-2 font-semibold ${mode === 'payment-link' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            onClick={() => form.setValue('mode', 'payment-link')}
            type="button"
          >
            Payment link
          </button>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Textarea
            placeholder={mode === 'invoice' ? 'Invoice Northstar Labs $2,100 for the payout dashboard milestone due next Friday.' : 'Create a Base USDC payment link for $950 for the design QA sprint.'}
            {...form.register('prompt')}
            className="bg-[#fcfcfd]"
          />
          {form.formState.errors.prompt ? <p className="text-sm text-[#717680]">{form.formState.errors.prompt.message}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button disabled={loading} type="submit">
              <MagicWand className="h-4 w-4" weight="bold" />
              {loading ? 'Generating draft...' : 'Generate structured draft'}
            </Button>
            <Button variant="secondary" type="button">
              Suggested prompt templates
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
