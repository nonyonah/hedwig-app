'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash, Faders, Bank, Globe, CaretDown } from '@/components/ui/lucide-icons';
import { Button, Dropdown, Label } from '@heroui/react';
import { Loader } from '@/components/ui/loader';
import { hedwigApi } from '@/lib/api/client';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { EXPENSE_CATEGORIES } from '@/lib/types/revenue';

export function SettingsClient({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({ descriptionPattern: '', category: '', priority: '0' });

  const loadRules = () => {
    if (!accessToken) return;
    setLoading(true);
    hedwigApi.categorizationRules({ accessToken })
      .then((data) => setRules(data))
      .catch(() => toast({ type: 'error', title: 'Failed to load rules', message: 'Could not load categorization rules.' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRules(); }, [accessToken]);

  const handleCreate = async () => {
    if (!newRule.descriptionPattern || !newRule.category) {
      toast({ type: 'error', title: 'Missing fields', message: 'Description pattern and category are required.' });
      return;
    }
    try {
      await hedwigApi.createCategorizationRule({
        conditions: { descriptionContains: newRule.descriptionPattern },
        category: newRule.category,
        priority: parseInt(newRule.priority, 10) || 0,
      }, { accessToken: accessToken ?? undefined });
      toast({ type: 'success', title: 'Rule created', message: 'Auto-categorization rule saved.' });
      setShowCreate(false);
      setNewRule({ descriptionPattern: '', category: '', priority: '0' });
      loadRules();
    } catch {
      toast({ type: 'error', title: 'Failed to create', message: 'Could not create rule.' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await hedwigApi.deleteCategorizationRule(id, { accessToken: accessToken ?? undefined });
      toast({ type: 'success', title: 'Rule deleted', message: 'Categorization rule removed.' });
      loadRules();
    } catch {
      toast({ type: 'error', title: 'Failed to delete', message: 'Could not delete rule.' });
    }
  };

  return (
    <div className="space-y-8">
      {/* Categorization Rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Auto-categorization Rules</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Automatically categorize imported transactions by description pattern.</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[12px] font-semibold text-[var(--color-foreground)] transition hover:bg-[var(--color-background)]"
          >
            <Plus className="h-3.5 w-3.5" weight="bold" />
            Add Rule
          </button>
        </div>

        {showCreate && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">Description contains</p>
                <input
                  type="text"
                  value={newRule.descriptionPattern}
                  onChange={(e) => setNewRule((r) => ({ ...r, descriptionPattern: e.target.value }))}
                  placeholder="e.g. AMAZON"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)]"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">Category</p>
                <Dropdown>
                  <Button
                    variant="secondary"
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-[13px] font-medium text-[var(--color-foreground)]"
                    aria-label="Select category"
                  >
                    <span>{newRule.category ? (newRule.category.charAt(0).toUpperCase() + newRule.category.slice(1)) : 'Select category'}</span>
                    <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
                  </Button>
                  <Dropdown.Popover className="min-w-[200px]">
                    <Dropdown.Menu
                      selectedKeys={newRule.category ? new Set([newRule.category]) : new Set()}
                      selectionMode="single"
                      onSelectionChange={(keys) => {
                        const key = [...keys][0];
                        setNewRule((r) => ({ ...r, category: (key as string) || '' }));
                      }}
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <Dropdown.Item key={cat} id={cat} textValue={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                          <Label>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Label>
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">Priority</p>
                <input
                  type="number"
                  value={newRule.priority}
                  onChange={(e) => setNewRule((r) => ({ ...r, priority: e.target.value }))}
                  min={0}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
              >
                Save Rule
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={20} />
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Faders className="h-8 w-8 text-[var(--color-border-input)]" weight="thin" />
              <p className="text-[13px] text-[var(--color-text-muted)]">No rules yet. Add one to auto-categorize transactions.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {rules.map((rule: any) => (
                <div key={rule.id} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-[var(--color-background)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)]">
                      <Faders className="h-4 w-4 text-[var(--color-text-muted)]" weight="bold" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">
                        Description contains &ldquo;{rule.conditions?.descriptionContains || '(no pattern)'}&rdquo;
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">→ {rule.category}</p>
                    </div>
                  </div>
                  <RowActionsMenu
                    items={[
                      { label: 'Delete', onClick: () => handleDelete(rule.id), destructive: true },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tax Jurisdiction */}
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Tax Jurisdiction</p>
        <p className="text-[13px] text-[var(--color-text-tertiary)]">Configure jurisdiction for deductible estimates.</p>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)]">
              <Globe className="h-4 w-4 text-[var(--color-text-muted)]" weight="bold" />
            </span>
            <div className="flex-1">
              <p className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Jurisdiction</p>
              <Dropdown>
                <Button
                  variant="secondary"
                  className="flex h-9 w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-[13px] font-medium text-[var(--color-foreground)]"
                  aria-label="Select jurisdiction"
                >
                  <span>United States (IRS)</span>
                  <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
                </Button>
                <Dropdown.Popover className="min-w-[220px]">
                  <Dropdown.Menu selectionMode="single" selectedKeys={new Set(['us'])}>
                    <Dropdown.Item key="us" id="us" textValue="United States (IRS)">
                      <Label>United States (IRS)</Label>
                    </Dropdown.Item>
                    <Dropdown.Item key="uk" id="uk" textValue="United Kingdom (HMRC)">
                      <Label>United Kingdom (HMRC)</Label>
                    </Dropdown.Item>
                    <Dropdown.Item key="eu" id="eu" textValue="EU (VAT)">
                      <Label>EU (VAT)</Label>
                    </Dropdown.Item>
                    <Dropdown.Item key="sg" id="sg" textValue="Singapore (IRAS)">
                      <Label>Singapore (IRAS)</Label>
                    </Dropdown.Item>
                    <Dropdown.Item key="ae" id="ae" textValue="UAE (FTA)">
                      <Label>UAE (FTA)</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
