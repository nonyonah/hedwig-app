'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CaretDown,
  CheckCircle,
  FileText,
  FolderSimple,
  LinkSimple,
  Plus,
  SpinnerGap,
  Trash,
  User,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { backendConfig } from '@/lib/auth/config';
import { hedwigApi } from '@/lib/api/client';
import type { Client, Project } from '@/lib/models/entities';
import type { CreateProjectFlowInput } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';

type CreateFlow = 'menu' | 'invoice' | 'payment-link' | 'client' | 'project';

type LineItemForm = { id: string; description: string; amount: string };
type MilestoneForm = { id: string; title: string; amount: string; dueDate: string };

const defaultInvoiceForm = {
  clientId: '',
  clientName: '',
  clientEmail: '',
  amount: '',
  currency: 'USD',
  dueDate: '',
  notes: '',
  linkedProjectId: '',
  reminderEnabled: true,
  lineItems: [] as LineItemForm[],
};

const defaultPaymentForm = {
  title: '',
  amount: '',
  currency: 'USDC',
  description: '',
  expiryDate: '',
  clientId: '',
  clientName: '',
  clientEmail: '',
  linkedProjectId: '',
};

const defaultClientForm = {
  name: '',
  email: '',
  company: '',
  notes: '',
};

const defaultProjectForm = {
  title: '',
  clientId: '',
  clientName: '',
  clientEmail: '',
  description: '',
  deadline: '',
  budget: '',
  notes: '',
  milestones: [] as MilestoneForm[],
};

function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toPositiveNumber(value: string): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function createLineItem(): LineItemForm {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    amount: '',
  };
}

function createMilestone(label = ''): MilestoneForm {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: label,
    amount: '',
    dueDate: '',
  };
}

async function postAuthedJson<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${backendConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message =
      payload?.error?.message ||
      (typeof payload?.error === 'string' ? payload.error : null) ||
      'Request failed';
    throw new Error(message);
  }

  return payload.data as T;
}

function formatCreatedMessage(flow: Exclude<CreateFlow, 'menu'>): { title: string; message: string } {
  if (flow === 'invoice') {
    return { title: 'Invoice created', message: 'Your invoice has been created.' };
  }
  if (flow === 'payment-link') {
    return { title: 'Payment link created', message: 'Your payment link is ready to share.' };
  }
  if (flow === 'client') {
    return { title: 'Client added', message: 'Client has been added to your workspace.' };
  }
  return { title: 'Project created', message: 'Contract generation has started automatically.' };
}

export function CreateMenu({ accessToken }: { accessToken?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<CreateFlow>('menu');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRefs, setIsLoadingRefs] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [invoiceForm, setInvoiceForm] = useState(defaultInvoiceForm);
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm);
  const [clientForm, setClientForm] = useState(defaultClientForm);
  const [projectForm, setProjectForm] = useState(defaultProjectForm);

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );

  const hasSession = Boolean(accessToken);

  const resetForms = () => {
    setInvoiceForm(defaultInvoiceForm);
    setPaymentForm(defaultPaymentForm);
    setClientForm(defaultClientForm);
    setProjectForm(defaultProjectForm);
    setFlow('menu');
  };

  const closeAndReset = () => {
    setOpen(false);
    resetForms();
  };

  const openWithFlow = (nextFlow: CreateFlow) => {
    setOpen(true);
    setFlow(nextFlow);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ flow?: CreateFlow }>).detail;
      const requestedFlow = detail?.flow;
      if (
        requestedFlow === 'invoice' ||
        requestedFlow === 'payment-link' ||
        requestedFlow === 'client' ||
        requestedFlow === 'project'
      ) {
        openWithFlow(requestedFlow);
        return;
      }
      openWithFlow('menu');
    };

    window.addEventListener('hedwig:open-create-menu', handler);
    return () => window.removeEventListener('hedwig:open-create-menu', handler);
  }, []);

  useEffect(() => {
    if (!open || !hasSession || !accessToken) return;

    let isMounted = true;
    setIsLoadingRefs(true);

    Promise.all([
      hedwigApi.clients({ accessToken, disableMockFallback: true }).catch(() => []),
      hedwigApi.projects({ accessToken, disableMockFallback: true }).catch(() => []),
    ])
      .then(([nextClients, nextProjects]) => {
        if (!isMounted) return;
        setClients(nextClients);
        setProjects(nextProjects);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingRefs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, accessToken, hasSession]);

  const requireSession = () => {
    if (hasSession && accessToken) return accessToken;
    toast({
      type: 'error',
      title: 'Session required',
      message: 'Please sign in again before creating records.',
    });
    return null;
  };

  const handleInvoiceCreate = async () => {
    const token = requireSession();
    if (!token) return;

    const selectedClient = invoiceForm.clientId ? clientById.get(invoiceForm.clientId) : null;
    const clientName = (selectedClient?.name || invoiceForm.clientName).trim();
    const clientEmail = (selectedClient?.email || invoiceForm.clientEmail).trim();
    const baseAmount = toPositiveNumber(invoiceForm.amount);

    const parsedItems = invoiceForm.lineItems
      .map((item) => ({
        description: item.description.trim(),
        amount: toPositiveNumber(item.amount),
      }))
      .filter((item) => item.description && item.amount > 0);

    const amount = parsedItems.length
      ? parsedItems.reduce((sum, item) => sum + item.amount, 0)
      : baseAmount;

    if (!clientName) {
      toast({ type: 'error', title: 'Client required', message: 'Select a client or enter a client name.' });
      return;
    }
    if (!amount) {
      toast({ type: 'error', title: 'Amount required', message: 'Enter a valid amount or line items.' });
      return;
    }
    if (!invoiceForm.currency) {
      toast({ type: 'error', title: 'Currency required', message: 'Select a currency.' });
      return;
    }
    if (!invoiceForm.dueDate) {
      toast({ type: 'error', title: 'Due date required', message: 'Set a due date for this invoice.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await postAuthedJson('/api/documents/invoice', token, {
        title: `Invoice for ${clientName}`,
        amount,
        currency: invoiceForm.currency,
        dueDate: invoiceForm.dueDate,
        description: invoiceForm.notes.trim() || undefined,
        clientId: selectedClient?.id,
        clientName,
        recipientEmail: clientEmail || undefined,
        projectId: invoiceForm.linkedProjectId || undefined,
        remindersEnabled: invoiceForm.reminderEnabled,
        items: parsedItems,
      });

      toast({ type: 'success', ...formatCreatedMessage('invoice') });
      closeAndReset();
      router.refresh();
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to create invoice', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentLinkCreate = async () => {
    const token = requireSession();
    if (!token) return;

    const selectedClient = paymentForm.clientId ? clientById.get(paymentForm.clientId) : null;
    const clientName = (selectedClient?.name || paymentForm.clientName).trim();
    const clientEmail = (selectedClient?.email || paymentForm.clientEmail).trim();
    const amount = toPositiveNumber(paymentForm.amount);
    const fallbackExpiry = formatDateInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    if (!paymentForm.title.trim()) {
      toast({ type: 'error', title: 'Title required', message: 'Set a title for this payment link.' });
      return;
    }
    if (!amount) {
      toast({ type: 'error', title: 'Amount required', message: 'Enter a valid amount.' });
      return;
    }
    if (!paymentForm.currency) {
      toast({ type: 'error', title: 'Currency required', message: 'Select a currency.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await postAuthedJson('/api/documents/payment-link', token, {
        title: paymentForm.title.trim(),
        amount,
        currency: paymentForm.currency,
        description: paymentForm.description.trim() || undefined,
        dueDate: paymentForm.expiryDate || fallbackExpiry,
        clientId: selectedClient?.id,
        clientName: clientName || undefined,
        recipientEmail: clientEmail || undefined,
        projectId: paymentForm.linkedProjectId || undefined,
      });

      toast({ type: 'success', ...formatCreatedMessage('payment-link') });
      closeAndReset();
      router.refresh();
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to create payment link', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClientCreate = async () => {
    const token = requireSession();
    if (!token) return;

    const name = clientForm.name.trim();
    const email = clientForm.email.trim();
    const company = clientForm.company.trim();
    const notes = clientForm.notes.trim();

    if (!name) {
      toast({ type: 'error', title: 'Name required', message: 'Enter a client name.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await postAuthedJson<{ client: Client }>('/api/clients', token, {
        name,
        email: email || undefined,
        company: company || undefined,
        notes: notes || undefined,
      });
      if (result?.client) {
        setClients((current) => [result.client, ...current]);
      }

      toast({ type: 'success', ...formatCreatedMessage('client') });
      closeAndReset();
      router.refresh();
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to add client', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const suggestMilestones = () => {
    const budget = toPositiveNumber(projectForm.budget);
    if (!budget) {
      toast({ type: 'error', title: 'Budget required', message: 'Add a budget first to generate milestone suggestions.' });
      return;
    }

    const baseDeadline = projectForm.deadline
      ? new Date(projectForm.deadline)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const nextMilestones: MilestoneForm[] = [
      { id: createMilestone().id, title: 'Kickoff and planning', amount: (budget * 0.3).toFixed(2), dueDate: formatDateInput(new Date(baseDeadline.getTime() - 14 * 24 * 60 * 60 * 1000)) },
      { id: createMilestone().id, title: 'Execution and review', amount: (budget * 0.4).toFixed(2), dueDate: formatDateInput(new Date(baseDeadline.getTime() - 7 * 24 * 60 * 60 * 1000)) },
      { id: createMilestone().id, title: 'Final delivery',       amount: (budget * 0.3).toFixed(2), dueDate: formatDateInput(baseDeadline) },
    ];

    setProjectForm((current) => ({ ...current, milestones: nextMilestones }));
    toast({ type: 'success', title: 'Milestones suggested', message: 'You can edit or remove any of these.' });
  };

  const summarizeScope = () => {
    const description = projectForm.description.trim();
    const notes = projectForm.notes.trim();
    if (!description && !notes) {
      toast({ type: 'error', title: 'Scope required', message: 'Add a description or notes first.' });
      return;
    }

    const parts = [description, notes].filter(Boolean);
    const summary = parts.join('. ').replace(/\s+/g, ' ').trim();
    setProjectForm((current) => ({ ...current, description: summary }));
    toast({ type: 'success', title: 'Scope summarized', message: 'Project description has been condensed.' });
  };

  const handleProjectCreate = async () => {
    const token = requireSession();
    if (!token) return;

    const selectedClient = projectForm.clientId ? clientById.get(projectForm.clientId) : null;
    const clientName = (selectedClient?.name || projectForm.clientName).trim();
    const clientEmail = (selectedClient?.email || projectForm.clientEmail).trim();

    if (!projectForm.title.trim()) {
      toast({ type: 'error', title: 'Title required', message: 'Enter a project title.' });
      return;
    }
    if (!clientName) {
      toast({ type: 'error', title: 'Client required', message: 'Select a client or enter a client name.' });
      return;
    }
    if (!projectForm.description.trim()) {
      toast({ type: 'error', title: 'Description required', message: 'Describe the project scope.' });
      return;
    }
    if (!projectForm.deadline) {
      toast({ type: 'error', title: 'Deadline required', message: 'Set a project deadline.' });
      return;
    }

    const milestones = projectForm.milestones
      .map((m) => ({ title: m.title.trim(), amount: toPositiveNumber(m.amount), dueDate: m.dueDate || undefined }))
      .filter((m) => m.title && m.amount > 0);

    const notesSuffix = projectForm.notes.trim();
    const description = notesSuffix
      ? `${projectForm.description.trim()}\n\nNotes:\n${notesSuffix}`
      : projectForm.description.trim();

    const payload: CreateProjectFlowInput = {
      title: projectForm.title.trim(),
      clientId: selectedClient?.id,
      clientName,
      clientEmail: clientEmail || undefined,
      description,
      deadline: projectForm.deadline,
      budget: toPositiveNumber(projectForm.budget) || undefined,
      currency: 'USD',
      milestones,
      startDate: formatDateInput(new Date()),
    };

    setIsSubmitting(true);
    try {
      await hedwigApi.createProjectFlow(payload, { accessToken: token, disableMockFallback: true });
      toast({ type: 'success', ...formatCreatedMessage('project') });
      closeAndReset();
      router.refresh();
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to create project', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedInvoiceClient = invoiceForm.clientId ? clientById.get(invoiceForm.clientId) : null;
  const selectedPaymentClient = paymentForm.clientId ? clientById.get(paymentForm.clientId) : null;

  const FLOW_TITLE: Record<CreateFlow, string> = {
    menu: 'Create',
    invoice: 'New invoice',
    'payment-link': 'New payment link',
    client: 'Add a client',
    project: 'New project',
  };

  const FLOW_DESCRIPTION: Record<CreateFlow, string> = {
    menu: 'Choose what you\'d like to create.',
    invoice: 'Line items and notes are optional.',
    'payment-link': 'Expiry defaults to 30 days if left blank.',
    client: 'You can add more details from the client page later.',
    project: 'A contract is generated automatically on creation.',
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForms();
      }}
    >
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {flow !== 'menu' && (
              <button
                type="button"
                onClick={() => setFlow('menu')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a4a7ae] transition hover:bg-[#f2f4f7] hover:text-[#414651]"
                aria-label="Back to menu"
              >
                <ArrowLeft className="h-4 w-4" weight="bold" />
              </button>
            )}
            <div>
              <DialogTitle>{FLOW_TITLE[flow]}</DialogTitle>
              <DialogDescription>{FLOW_DESCRIPTION[flow]}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="max-h-[72vh] overflow-y-auto">
          {!hasSession && (
            <div className="rounded-xl border border-[#fecdca] bg-[#fff6ed] px-4 py-3 text-[13px] text-[#717680]">
              Session unavailable — please sign in again to create records.
            </div>
          )}

          {/* ── Menu ── */}
          {flow === 'menu' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <CreateActionCard
                icon={<FileText className="h-4 w-4" weight="bold" />}
                title="Invoice"
                description="Create invoices with line items, due dates, and client details."
                onClick={() => setFlow('invoice')}
              />
              <CreateActionCard
                icon={<LinkSimple className="h-4 w-4" weight="bold" />}
                title="Payment Link"
                description="Generate a shareable link with a fixed amount and currency."
                onClick={() => setFlow('payment-link')}
              />
              <CreateActionCard
                icon={<User className="h-4 w-4" weight="bold" />}
                title="Client"
                description="Add a client with their contact and company details."
                onClick={() => setFlow('client')}
              />
              <CreateActionCard
                icon={<FolderSimple className="h-4 w-4" weight="bold" />}
                title="Project"
                description="Set scope, deadline, and milestones. Contract is auto-generated."
                onClick={() => setFlow('project')}
              />
            </div>
          )}

          {/* ── Invoice ── */}
          {flow === 'invoice' && (
            <div className="space-y-5">
              <Section label="Client">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Select client">
                    <FormSelect
                      value={invoiceForm.clientId}
                      onChange={(value) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          clientId: value,
                          clientName: value ? '' : f.clientName,
                          clientEmail: value ? '' : f.clientEmail,
                        }))
                      }
                      options={[
                        { value: '', label: 'Enter manually' },
                        ...clients.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </Field>
                  {!invoiceForm.clientId ? (
                    <Field label="Name" required>
                      <Input
                        placeholder="e.g. Acme Corp"
                        value={invoiceForm.clientName}
                        onChange={(e) => setInvoiceForm((f) => ({ ...f, clientName: e.target.value }))}
                      />
                    </Field>
                  ) : (
                    <Field label="Email">
                      <Input value={selectedInvoiceClient?.email || ''} disabled />
                    </Field>
                  )}
                  {!invoiceForm.clientId && (
                    <Field label="Email">
                      <Input
                        type="email"
                        placeholder="client@example.com"
                        value={invoiceForm.clientEmail}
                        onChange={(e) => setInvoiceForm((f) => ({ ...f, clientEmail: e.target.value }))}
                      />
                    </Field>
                  )}
                </div>
              </Section>

              <Section label="Invoice details">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Amount" required>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={invoiceForm.amount}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </Field>
                  <Field label="Currency" required>
                    <FormSelect
                      value={invoiceForm.currency}
                      onChange={(value) => setInvoiceForm((f) => ({ ...f, currency: value }))}
                      options={[
                        { value: 'USD', label: 'USD' },
                        { value: 'USDC', label: 'USDC' },
                      ]}
                    />
                  </Field>
                  <Field label="Due date" required>
                    <Input
                      type="date"
                      value={invoiceForm.dueDate}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                  </Field>
                </div>
              </Section>

              <Section label="Optional">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Linked project">
                      <FormSelect
                        value={invoiceForm.linkedProjectId}
                        onChange={(value) => setInvoiceForm((f) => ({ ...f, linkedProjectId: value }))}
                        options={[
                          { value: '', label: isLoadingRefs ? 'Loading…' : 'None' },
                          ...projects.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                        disabled={isLoadingRefs}
                      />
                    </Field>
                  </div>

                  <Toggle
                    checked={invoiceForm.reminderEnabled}
                    onChange={(checked) => setInvoiceForm((f) => ({ ...f, reminderEnabled: checked }))}
                    label="Payment reminders"
                    description="Automatically notify the client when payment is due."
                  />

                  <Field label="Line items">
                    <div className="space-y-2">
                      {invoiceForm.lineItems.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[11px] font-semibold text-[#717680]">
                            {index + 1}
                          </span>
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) =>
                              setInvoiceForm((f) => ({
                                ...f,
                                lineItems: f.lineItems.map((li) =>
                                  li.id === item.id ? { ...li, description: e.target.value } : li
                                ),
                              }))
                            }
                          />
                          <div className="w-28 shrink-0">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Amount"
                              value={item.amount}
                              onChange={(e) =>
                                setInvoiceForm((f) => ({
                                  ...f,
                                  lineItems: f.lineItems.map((li) =>
                                    li.id === item.id ? { ...li, amount: e.target.value } : li
                                  ),
                                }))
                              }
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setInvoiceForm((f) => ({
                                ...f,
                                lineItems: f.lineItems.filter((li) => li.id !== item.id),
                              }))
                            }
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a4a7ae] transition hover:bg-[#f2f4f7] hover:text-[#535862]"
                          >
                            <Trash className="h-3.5 w-3.5" weight="regular" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setInvoiceForm((f) => ({ ...f, lineItems: [...f.lineItems, createLineItem()] }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#535862] transition hover:border-[#d0d5dd] hover:bg-[#fafafa]"
                      >
                        <Plus className="h-3 w-3" weight="bold" />
                        Add line item
                      </button>
                    </div>
                  </Field>

                  <Field label="Notes">
                    <Textarea
                      value={invoiceForm.notes}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="A note visible on the invoice…"
                    />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {/* ── Payment link ── */}
          {flow === 'payment-link' && (
            <div className="space-y-5">
              <Section label="Details">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" required>
                    <Input
                      placeholder="e.g. Website design deposit"
                      value={paymentForm.title}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </Field>
                  <Field label="Amount" required>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </Field>
                  <Field label="Currency" required>
                    <FormSelect
                      value={paymentForm.currency}
                      onChange={(value) => setPaymentForm((f) => ({ ...f, currency: value }))}
                      options={[
                        { value: 'USDC', label: 'USDC' },
                        { value: 'USD', label: 'USD' },
                      ]}
                    />
                  </Field>
                  <Field label="Expiry date">
                    <Input
                      type="date"
                      value={paymentForm.expiryDate}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, expiryDate: e.target.value }))}
                    />
                  </Field>
                </div>
              </Section>

              <Section label="Optional">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Client">
                      <FormSelect
                        value={paymentForm.clientId}
                        onChange={(value) =>
                          setPaymentForm((f) => ({
                            ...f,
                            clientId: value,
                            clientName: value ? '' : f.clientName,
                            clientEmail: value ? '' : f.clientEmail,
                          }))
                        }
                        options={[
                          { value: '', label: 'None' },
                          ...clients.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      />
                    </Field>
                    {!paymentForm.clientId ? (
                      <Field label="Client name">
                        <Input
                          placeholder="e.g. Acme Corp"
                          value={paymentForm.clientName}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, clientName: e.target.value }))}
                        />
                      </Field>
                    ) : (
                      <Field label="Client email">
                        <Input value={selectedPaymentClient?.email || ''} disabled />
                      </Field>
                    )}
                    {!paymentForm.clientId && (
                      <Field label="Client email">
                        <Input
                          type="email"
                          placeholder="client@example.com"
                          value={paymentForm.clientEmail}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, clientEmail: e.target.value }))}
                        />
                      </Field>
                    )}
                    <Field label="Linked project">
                      <FormSelect
                        value={paymentForm.linkedProjectId}
                        onChange={(value) => setPaymentForm((f) => ({ ...f, linkedProjectId: value }))}
                        options={[
                          { value: '', label: isLoadingRefs ? 'Loading…' : 'None' },
                          ...projects.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                        disabled={isLoadingRefs}
                      />
                    </Field>
                  </div>
                  <Field label="Description">
                    <Textarea
                      value={paymentForm.description}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Visible to whoever opens the payment link…"
                    />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {/* ── Client ── */}
          {flow === 'client' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input
                  placeholder="e.g. Aisha Bello"
                  value={clientForm.name}
                  onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={clientForm.email}
                  onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field label="Company">
                <Input
                  placeholder="Optional"
                  value={clientForm.company}
                  onChange={(e) => setClientForm((f) => ({ ...f, company: e.target.value }))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <Textarea
                    value={clientForm.notes}
                    onChange={(e) => setClientForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Internal notes — not visible to the client…"
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── Project ── */}
          {flow === 'project' && (
            <div className="space-y-5">
              <Section label="Project details">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" required>
                    <Input
                      placeholder="e.g. Brand identity redesign"
                      value={projectForm.title}
                      onChange={(e) => setProjectForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </Field>
                  <Field label="Deadline" required>
                    <Input
                      type="date"
                      value={projectForm.deadline}
                      onChange={(e) => setProjectForm((f) => ({ ...f, deadline: e.target.value }))}
                    />
                  </Field>
                  <Field label="Budget">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                      value={projectForm.budget}
                      onChange={(e) => setProjectForm((f) => ({ ...f, budget: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="mt-3 space-y-3">
                  <Field label="Description" required>
                    <Textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Describe the project scope and deliverables…"
                    />
                  </Field>
                  <Field label="Internal notes">
                    <Textarea
                      value={projectForm.notes}
                      onChange={(e) => setProjectForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Private notes — not included in the contract…"
                    />
                  </Field>
                </div>
              </Section>

              <Section label="Client">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Select client" required>
                    <FormSelect
                      value={projectForm.clientId}
                      onChange={(value) =>
                        setProjectForm((f) => ({
                          ...f,
                          clientId: value,
                          clientName: value ? '' : f.clientName,
                          clientEmail: value ? '' : f.clientEmail,
                        }))
                      }
                      options={[
                        { value: '', label: 'Enter manually' },
                        ...clients.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </Field>
                  {!projectForm.clientId ? (
                    <Field label="Name" required>
                      <Input
                        placeholder="Client name"
                        value={projectForm.clientName}
                        onChange={(e) => setProjectForm((f) => ({ ...f, clientName: e.target.value }))}
                      />
                    </Field>
                  ) : (
                    <Field label="Email">
                      <Input value={clientById.get(projectForm.clientId)?.email || ''} disabled />
                    </Field>
                  )}
                  {!projectForm.clientId && (
                    <Field label="Email">
                      <Input
                        type="email"
                        placeholder="client@example.com"
                        value={projectForm.clientEmail}
                        onChange={(e) => setProjectForm((f) => ({ ...f, clientEmail: e.target.value }))}
                      />
                    </Field>
                  )}
                </div>
              </Section>

              <Section label="Milestones">
                <div className="space-y-2">
                  {projectForm.milestones.length === 0 && (
                    <p className="text-[13px] text-[#a4a7ae]">
                      No milestones yet. Add them manually or use Suggest milestones.
                    </p>
                  )}
                  {projectForm.milestones.map((milestone, index) => (
                    <div key={milestone.id} className="rounded-xl border border-[#e9eaeb] bg-[#fafafa] p-3.5">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                          Milestone {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setProjectForm((f) => ({
                              ...f,
                              milestones: f.milestones.filter((m) => m.id !== milestone.id),
                            }))
                          }
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[#a4a7ae] transition hover:bg-[#f2f4f7] hover:text-[#535862]"
                        >
                          <Trash className="h-3.5 w-3.5" weight="regular" />
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_110px_140px]">
                        <Input
                          placeholder="e.g. Initial wireframes"
                          value={milestone.title}
                          onChange={(e) =>
                            setProjectForm((f) => ({
                              ...f,
                              milestones: f.milestones.map((m) =>
                                m.id === milestone.id ? { ...m, title: e.target.value } : m
                              ),
                            }))
                          }
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount"
                          value={milestone.amount}
                          onChange={(e) =>
                            setProjectForm((f) => ({
                              ...f,
                              milestones: f.milestones.map((m) =>
                                m.id === milestone.id ? { ...m, amount: e.target.value } : m
                              ),
                            }))
                          }
                        />
                        <Input
                          type="date"
                          value={milestone.dueDate}
                          onChange={(e) =>
                            setProjectForm((f) => ({
                              ...f,
                              milestones: f.milestones.map((m) =>
                                m.id === milestone.id ? { ...m, dueDate: e.target.value } : m
                              ),
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setProjectForm((f) => ({ ...f, milestones: [...f.milestones, createMilestone()] }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#535862] transition hover:border-[#d0d5dd] hover:bg-[#fafafa]"
                    >
                      <Plus className="h-3 w-3" weight="bold" />
                      Add milestone
                    </button>
                    <button
                      type="button"
                      onClick={suggestMilestones}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#535862] transition hover:border-[#d0d5dd] hover:bg-[#fafafa]"
                    >
                      Suggest milestones
                    </button>
                    <button
                      type="button"
                      onClick={summarizeScope}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#535862] transition hover:border-[#d0d5dd] hover:bg-[#fafafa]"
                    >
                      Summarize scope
                    </button>
                  </div>
                </div>
              </Section>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={closeAndReset} disabled={isSubmitting}>
            Cancel
          </Button>
          {flow !== 'menu' && (
            <Button
              onClick={() => {
                if (flow === 'invoice')       { void handleInvoiceCreate(); return; }
                if (flow === 'payment-link')  { void handlePaymentLinkCreate(); return; }
                if (flow === 'client')        { void handleClientCreate(); return; }
                void handleProjectCreate();
              }}
              disabled={isSubmitting || !hasSession}
            >
              {isSubmitting ? (
                <>
                  <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                  Creating…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" weight="bold" />
                  Create
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
          {label}
        </span>
        <div className="h-px flex-1 bg-[#f2f4f7]" />
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-[#414651]">
        {label}
        {required && <span className="ml-0.5 text-[#717680]">*</span>}
      </label>
      {children}
    </div>
  );
}

function FormSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="relative flex h-10 w-full items-center rounded-lg border border-[#e9eaeb] bg-white px-3.5 shadow-xs transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none bg-transparent pr-5 text-[13px] text-[#181d27] outline-none disabled:text-[#a4a7ae]"
      >
        {options.map((opt) => (
          <option key={`${opt.value}-${opt.label}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <CaretDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-[#a4a7ae]" weight="bold" />
    </div>
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={3}
      className="min-h-[88px] w-full resize-none rounded-lg border border-[#e9eaeb] bg-white px-3.5 py-2.5 text-[13px] text-[#181d27] shadow-xs outline-none placeholder:text-[#a4a7ae] transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-[#e9eaeb] bg-[#fafafa] px-4 py-3 text-left transition hover:bg-[#f5f6f7]"
    >
      <div>
        <p className="text-[13px] font-semibold text-[#181d27]">{label}</p>
        {description && <p className="mt-0.5 text-[12px] text-[#a4a7ae]">{description}</p>}
      </div>
      <div
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[#2563eb]' : 'bg-[#d5d7da]'
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}

function CreateActionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-[#e9eaeb] bg-white p-5 text-left transition hover:border-[#c8cbd0] hover:shadow-sm active:scale-[0.99]"
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f4f7] text-[#717680]">
        {icon}
      </div>
      <p className="text-[14px] font-semibold text-[#181d27]">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#a4a7ae]">{description}</p>
    </button>
  );
}
