import type { LedgerFeedEntry } from '../hooks/useLedgerFeed';

export interface DayGroup {
    key: string;
    label: string;
    items: LedgerFeedEntry[];
}

function dayKey(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'unknown';
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Other';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - day.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString(undefined, sameYear
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Groups ledger entries by calendar day, newest day first (entries keep feed order). */
export function buildDayGroups(entries: LedgerFeedEntry[]): DayGroup[] {
    const map = new Map<string, LedgerFeedEntry[]>();
    for (const e of entries) {
        const key = dayKey(e.date);
        const list = map.get(key);
        if (list) list.push(e);
        else map.set(key, [e]);
    }
    return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, items]) => ({ key, label: dayLabel(items[0].date), items }));
}
