'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles, WandSparkles } from 'lucide-react';
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
    <Card className="bg-hero bg-cover bg-top text-white">
      <CardHeader>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs uppercase tracking-[0.24em]">AI actions</span>
        </div>
        <CardTitle className="text-white">Create billing flows from prompts</CardTitle>
        <CardDescription className="text-slate-300">
          AI helps draft structured invoices and payment links, but confirmation stays inside the workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
          <button
            className={`rounded-full px-4 py-2 ${mode === 'invoice' ? 'bg-primary text-primary-foreground' : 'text-slate-300'}`}
            onClick={() => form.setValue('mode', 'invoice')}
            type="button"
          >
            Invoice
          </button>
          <button
            className={`rounded-full px-4 py-2 ${mode === 'payment-link' ? 'bg-primary text-primary-foreground' : 'text-slate-300'}`}
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
            className="border-white/10 bg-slate-950/65 text-white placeholder:text-slate-400"
          />
          {form.formState.errors.prompt ? <p className="text-sm text-amber-200">{form.formState.errors.prompt.message}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button className="bg-white text-slate-950 hover:bg-slate-100" disabled={loading} type="submit">
              <WandSparkles className="h-4 w-4" />
              {loading ? 'Generating draft...' : 'Generate structured draft'}
            </Button>
            <Button variant="outline" type="button" className="border-white/10 text-white hover:bg-white/5">
              Suggested prompt templates
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
