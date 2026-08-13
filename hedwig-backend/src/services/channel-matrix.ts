import { createLogger } from '../utils/logger';

const logger = createLogger('ChannelMatrix');

/**
 * Event → channel matrix (REVENUE-PAGE-STRATEGY §3.9).
 *
 * The Timeline is the record. The bell, push, and email are DERIVED, deduped
 * layers: a single event is delivered over exactly one real-time channel, and
 * copies are batched into digests that only fire if the item is still
 * unhandled. This service is the single decision point for that routing.
 *
 * Channel values per event class:
 *   email: 'immediate' | 'weekly' | 'off'
 *   push:  'immediate' | 'digest' | 'off'
 *
 * Hard rules enforced here:
 *   1. No double delivery — an event with an 'immediate' email is skipped
 *      from the weekly digest (`shouldSkipFromDigest`).
 *   2. Critical bypass — payment failure / duplicate / fraud-class events are
 *      never batched (`isCriticalEvent`); they always deliver on every
 *      configured channel.
 *   3. Frequency caps — non-critical push is capped (default 3/month) via
 *      `pushBudgetExceeded`; the scheduler consults it before sending.
 *
 * User-level overrides live in users.notif_preferences (JSONB, migration 095):
 *   { "<eventClass>": { "email": "immediate|weekly|off", "push": "immediate|digest|off" } }
 * An empty object (the default) means "use the default matrix".
 */

export type EmailChannel = 'immediate' | 'weekly' | 'off';
export type PushChannel = 'immediate' | 'digest' | 'off';

export interface ChannelPlan {
  email: EmailChannel;
  push: PushChannel;
}

export type NotifPrefs = Record<string, Partial<ChannelPlan> | undefined>;

export const EVENT_CLASSES = [
  'payment_received',
  'invoice_paid',
  'invoice_sent',
  'invoice_viewed',
  'invoice_overdue',
  'dunning_escalation',
  'receipt_imported',
  'expense_detected',
  'subscription_detected',
  'statement_imported',
  'offramp_completed',
  'deposit_received',
  'refund_received',
  'treasury_transfer',
  'payroll_completed',
  'contract_signed',
  'ai_categorization',
  'duplicate_payment',
  'tax_deadline',
  'weekly_summary',
  'daily_brief',
  'monthly_state_of_business',
] as const;

export type EventClass = (typeof EVENT_CLASSES)[number];

/** Critical events bypass batching entirely — never weekly, always immediate. */
const CRITICAL_EVENTS: ReadonlySet<string> = new Set(['duplicate_payment']);

const DEFAULT_MATRIX: Record<EventClass, ChannelPlan> = {
  // THE high-intent moment: immediate email (receipt) + push. Push copy must
  // never contain amounts — handled at the call site.
  payment_received: { email: 'immediate', push: 'immediate' },
  invoice_paid: { email: 'immediate', push: 'off' },
  // Record only.
  invoice_sent: { email: 'off', push: 'off' },
  // Silent unless an overdue is approaching — bell-only, decided at emit time.
  invoice_viewed: { email: 'off', push: 'off' },
  // Email = first dunning touch; push stays off until the final stage.
  invoice_overdue: { email: 'immediate', push: 'off' },
  dunning_escalation: { email: 'immediate', push: 'off' },
  // Batch imports into one bell item — no push, no email.
  receipt_imported: { email: 'off', push: 'off' },
  // Weekly email batch is fine; unmatched items belong in the bell.
  expense_detected: { email: 'weekly', push: 'off' },
  // Merged into the monthly bill-review email.
  subscription_detected: { email: 'weekly', push: 'off' },
  // Bell on conflicts only.
  statement_imported: { email: 'off', push: 'off' },
  // Money movement — high intent, both channels.
  offramp_completed: { email: 'immediate', push: 'immediate' },
  deposit_received: { email: 'off', push: 'immediate' },
  refund_received: { email: 'off', push: 'off' },
  // "Money is working" story — monthly digest only.
  treasury_transfer: { email: 'weekly', push: 'off' },
  payroll_completed: { email: 'immediate', push: 'off' },
  contract_signed: { email: 'off', push: 'off' },
  // Silent metadata, not a feed row.
  ai_categorization: { email: 'off', push: 'off' },
  // Critical-alert bypass: never batched, all channels.
  duplicate_payment: { email: 'immediate', push: 'immediate' },
  // 2-touch reminder window (−21d, −7d) — email only.
  tax_deadline: { email: 'immediate', push: 'off' },
  weekly_summary: { email: 'immediate', push: 'off' },
  daily_brief: { email: 'immediate', push: 'off' },
  monthly_state_of_business: { email: 'immediate', push: 'off' },
};

const EMAIL_VALUES: ReadonlySet<string> = new Set(['immediate', 'weekly', 'off']);
const PUSH_VALUES: ReadonlySet<string> = new Set(['immediate', 'digest', 'off']);

function parseOverrides(raw: unknown): NotifPrefs {
  if (!raw || typeof raw !== 'object') return {};
  const prefs: NotifPrefs = {};
  try {
    for (const [key, value] of Object.entries(raw)) {
      if (value && typeof value === 'object') {
        const plan: Partial<ChannelPlan> = {};
        const email = (value as Record<string, unknown>).email;
        const push = (value as Record<string, unknown>).push;
        if (typeof email === 'string' && EMAIL_VALUES.has(email)) plan.email = email as EmailChannel;
        if (typeof push === 'string' && PUSH_VALUES.has(push)) plan.push = push as PushChannel;
        if (Object.keys(plan).length > 0) prefs[key] = plan;
      }
    }
  } catch (error) {
    logger.warn('Failed to parse notif_preferences', { error: error instanceof Error ? error.message : String(error) });
    return {};
  }
  return prefs;
}

/**
 * Resolve the effective channel plan for an event class, merging the
 * user's notif_preferences overrides (migration 095 column) over the
 * default matrix.
 */
export function resolveChannelPlan(eventClass: EventClass, rawPrefs?: unknown): ChannelPlan {
  const defaults = DEFAULT_MATRIX[eventClass] ?? { email: 'off' as EmailChannel, push: 'off' as PushChannel };
  if (!rawPrefs) return defaults;
  const prefs = parseOverrides(rawPrefs);
  const overrides = prefs[eventClass];
  if (!overrides) return defaults;
  return {
    email: overrides.email ?? defaults.email,
    push: overrides.push ?? defaults.push,
  };
}

export function isCriticalEvent(eventClass: string): boolean {
  return CRITICAL_EVENTS.has(eventClass);
}

/**
 * Hard rule 1 — no double delivery: an event that fires an immediate email
 * (or is critical) must be omitted from the weekly digest for that user.
 * The scheduler consults this before including an item in a batch digest.
 */
export function shouldSkipFromDigest(eventClass: EventClass | string, plan?: ChannelPlan): boolean {
  if (isCriticalEvent(eventClass)) return true;
  if (!plan) return false;
  return plan.email === 'immediate';
}

export function shouldSendEmail(plan: ChannelPlan): boolean {
  return plan.email === 'immediate' || plan.email === 'weekly';
}

export function shouldSendPush(plan: ChannelPlan): boolean {
  return plan.push === 'immediate';
}

/** Default monthly cap on non-critical pushes (strategy: ≤2–3/month). */
export const DEFAULT_PUSH_CAP = 3;

/**
 * Hard rule 3 — frequency cap: count assistant-type pushes with
 * `metadata.push_sent = true` since the start of the current month and
 * report whether the budget is exhausted.
 */
export async function pushBudgetExceeded(
  supabase: any,
  userId: string,
  cap: number = DEFAULT_PUSH_CAP,
): Promise<boolean> {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'assistant')
      .eq('metadata->>push_sent', 'true')
      .gte('created_at', monthStart.toISOString());
    if (error) {
      logger.warn('pushBudgetExceeded query failed', { userId, error: error.message });
      return false;
    }
    return (count ?? 0) >= cap;
  } catch (error) {
    logger.warn('pushBudgetExceeded failed', { userId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
