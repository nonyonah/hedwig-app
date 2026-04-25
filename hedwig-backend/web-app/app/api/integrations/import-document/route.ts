import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';
import type {
  ExtractedInvoiceData,
  ImportReviewResult,
  ReviewDecision,
} from '@/lib/types/import-review';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asPositiveNumber = (value: unknown): number | null => {
  // Strip currency symbols, commas, and spaces so Gemini strings like "$5,000.00" parse correctly
  const cleaned = typeof value === 'string' ? value.replace(/[$€£₦,\s]/g, '') : value;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normalizeDate = (value?: string): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const fallbackDueDate = (): string => {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  return due.toISOString().slice(0, 10);
};

const buildInvoiceItems = (lineItems?: ExtractedInvoiceData['line_items']): Array<{ description: string; amount: number }> => {
  if (!Array.isArray(lineItems)) return [];
  return lineItems
    .map((item) => {
      const description = String(item.description || '').trim();
      const total = asPositiveNumber(item.total);
      const computed =
        asPositiveNumber(item.quantity) && asPositiveNumber(item.unit_price)
          ? Number(item.quantity) * Number(item.unit_price)
          : null;
      const amount = total ?? computed;
      if (!description || !amount) return null;
      return { description, amount };
    })
    .filter((item): item is { description: string; amount: number } => Boolean(item));
};

const resolveInvoiceAmount = (
  extracted: ExtractedInvoiceData,
  items: Array<{ description: string; amount: number }>,
): number | null => {
  const directAmount = asPositiveNumber(extracted.amount_total);
  if (directAmount) return directAmount;
  if (!items.length) return null;
  return items.reduce((sum, item) => sum + item.amount, 0);
};

const decisionFor = (decisions: ReviewDecision[], entityType: ReviewDecision['entity_type']) =>
  decisions.find((decision) => decision.entity_type === entityType);

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as
    | {
        documentType?: string;
        extractedInvoiceData?: ExtractedInvoiceData;
        decisions?: ReviewDecision[];
      }
    | null;

  if (String(body?.documentType || 'invoice').toLowerCase() !== 'invoice' || !body?.extractedInvoiceData) {
    return NextResponse.json({ success: false, error: 'Only live invoice imports are supported right now.' }, { status: 400 });
  }

  const extracted = body.extractedInvoiceData;
  const decisions = Array.isArray(body.decisions) ? body.decisions : [];

  console.log('[import-document] decisions received:', decisions.map(d => `${d.entity_type}:${d.decision}`));
  console.log('[import-document] extracted amount_total:', extracted.amount_total, 'currency:', extracted.currency);

  const execution: ImportReviewResult = {
    created_entities: [],
    linked_entities: [],
    ignored_entities: [],
    deferred_entities: [],
  };

  const clientDecision = decisionFor(decisions, 'client');
  const projectDecision = decisionFor(decisions, 'project');
  const invoiceDecision = decisionFor(decisions, 'invoice');
  const contractDecision = decisionFor(decisions, 'contract');

  if (clientDecision?.decision === 'reject') {
    execution.ignored_entities.push({ entity_type: 'client', label: extracted.issuer_name || 'Imported client' });
  } else if (clientDecision?.decision === 'defer' || clientDecision?.decision === 'skip') {
    execution.deferred_entities.push({ entity_type: 'client', label: extracted.issuer_name || 'Imported client' });
  }

  if (projectDecision?.decision === 'reject') {
    execution.ignored_entities.push({ entity_type: 'project', label: extracted.project_reference || 'Imported project' });
  } else if (projectDecision?.decision === 'defer' || projectDecision?.decision === 'skip') {
    execution.deferred_entities.push({ entity_type: 'project', label: extracted.project_reference || 'Imported project' });
  } else if (projectDecision?.decision === 'approve_creation' || projectDecision?.decision === 'edit_then_approve') {
    execution.deferred_entities.push({
      entity_type: 'project',
      label: `${projectDecision.edited_value || extracted.project_reference || 'Imported project'} (project creation from import not supported yet)`,
    });
  }

  if (contractDecision?.decision === 'reject') {
    execution.ignored_entities.push({ entity_type: 'contract', label: 'Related contract' });
  } else if (
    contractDecision?.decision === 'defer' ||
    contractDecision?.decision === 'skip' ||
    contractDecision?.decision === 'link_existing' ||
    contractDecision?.decision === 'approve_creation' ||
    contractDecision?.decision === 'edit_then_approve'
  ) {
    execution.deferred_entities.push({
      entity_type: 'contract',
      label: 'Contract linking and contract creation from import are pending backend support',
    });
  }

  if (invoiceDecision?.decision === 'reject') {
    execution.ignored_entities.push({ entity_type: 'invoice', label: extracted.invoice_number || 'Imported invoice' });
    return NextResponse.json({ success: true, data: { execution } });
  }

  if (invoiceDecision?.decision === 'defer' || invoiceDecision?.decision === 'skip' || !invoiceDecision) {
    execution.deferred_entities.push({ entity_type: 'invoice', label: extracted.invoice_number || 'Imported invoice' });
    return NextResponse.json({ success: true, data: { execution } });
  }

  if (invoiceDecision.decision === 'link_existing' && invoiceDecision.selected_existing_match_id) {
    execution.linked_entities.push({
      entity_type: 'invoice',
      label: invoiceDecision.selected_existing_match_id,
    });
    return NextResponse.json({ success: true, data: { execution } });
  }

  const items = buildInvoiceItems(extracted.line_items);
  const amount = resolveInvoiceAmount(extracted, items);
  console.log('[import-document] resolved amount:', amount, '| clientName:', clientDecision?.decision === 'approve_creation' || clientDecision?.decision === 'edit_then_approve' ? clientDecision?.edited_value || extracted.issuer_name : '(not creating)');
  if (!amount) {
    console.error('[import-document] amount is null — amount_total:', extracted.amount_total, '| line_items:', JSON.stringify(extracted.line_items));
    return NextResponse.json(
      { success: false, error: 'Could not detect a valid amount from this invoice. Please edit and try again.' },
      { status: 422 },
    );
  }

  const dueDate = normalizeDate(extracted.due_date) || normalizeDate(extracted.issue_date) || fallbackDueDate();
  const descriptionFromItems = items.slice(0, 3).map((item) => item.description).join(', ');
  const description = extracted.notes || descriptionFromItems || `Imported invoice${extracted.invoice_number ? ` ${extracted.invoice_number}` : ''}`;
  const invoiceLabel = invoiceDecision.edited_value || extracted.invoice_number;
  const title = invoiceLabel ? `Invoice ${invoiceLabel}` : extracted.title || 'Imported invoice';

  const clientId =
    clientDecision?.decision === 'link_existing' ? clientDecision.selected_existing_match_id || undefined : undefined;
  const clientName =
    clientDecision?.decision === 'approve_creation' || clientDecision?.decision === 'edit_then_approve'
      ? clientDecision.edited_value || extracted.issuer_name || undefined
      : undefined;
  const projectId =
    projectDecision?.decision === 'link_existing' ? projectDecision.selected_existing_match_id || undefined : undefined;

  // Use the issuer's email (sender_email) for client creation — not recipient_email,
  // which is the invoice recipient (often the user themselves).
  const clientEmail =
    clientDecision?.decision === 'approve_creation' || clientDecision?.decision === 'edit_then_approve'
      ? (EMAIL_REGEX.test(String(extracted.sender_email || '').trim()) ? String(extracted.sender_email).trim().toLowerCase() : undefined)
      : undefined;

  const isPaid = extracted.payment_status === 'paid';

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/documents/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      title,
      amount,
      currency: extracted.currency || 'USD',
      dueDate,
      description,
      clientId,
      clientName,
      recipientEmail: clientEmail,
      items,
      projectId,
      isPaid,
      noEmail: true,
    }),
  }).catch(() => null);

  if (!resp) {
    console.error('[import-document] backend unreachable');
    return NextResponse.json({ success: false, error: 'Could not reach backend' }, { status: 502 });
  }

  const payload = await resp.json().catch(() => ({ success: false })) as {
    success?: boolean;
    error?: string | { message?: string };
    data?: { document?: Record<string, unknown> };
  };

  console.log('[import-document] backend resp status:', resp.status, '| success:', payload?.success, '| doc id:', payload?.data?.document?.['id']);
  if (!resp.ok || !payload?.success || !payload.data?.document) {
    const errorMessage =
      typeof payload?.error === 'string' ? payload.error : payload?.error?.message || 'Failed to import invoice.';
    console.error('[import-document] backend error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: resp.status || 500 });
  }

  if (clientDecision?.decision === 'link_existing' && clientDecision.selected_existing_match_id) {
    execution.linked_entities.push({ entity_type: 'client', label: clientDecision.selected_existing_match_id });
  } else if (clientDecision?.decision === 'approve_creation' || clientDecision?.decision === 'edit_then_approve') {
    execution.created_entities.push({
      entity_type: 'client',
      label: clientDecision.edited_value || extracted.issuer_name || 'Imported client',
    });
  }

  if (projectDecision?.decision === 'link_existing' && projectDecision.selected_existing_match_id) {
    execution.linked_entities.push({ entity_type: 'project', label: projectDecision.selected_existing_match_id });
  }

  execution.created_entities.push({
    entity_type: 'invoice',
    label: String(payload.data.document.id || extracted.invoice_number || 'Imported invoice'),
  });

  return NextResponse.json({
    success: true,
    data: {
      document: payload.data.document,
      execution,
    },
  });
}
