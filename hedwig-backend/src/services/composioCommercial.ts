import { Composio } from '@composio/core';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import type { ComposioProvider, ComposioConnectionRecord } from './composio';

const logger = createLogger('ComposioCommercial');

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

let cachedSdk: Composio | null = null;
function getSdk(): Composio {
  if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY is not configured');
  if (cachedSdk) return cachedSdk;
  cachedSdk = new Composio({ apiKey: COMPOSIO_API_KEY });
  return cachedSdk;
}

function userIdFor(hedwigUserId: string): string {
  return `hedwig_${hedwigUserId}`;
}

// ─── Linear helpers ──────────────────────────────────────────────────────────

const doneStateIdCache = new Map<string, string>();

async function getDoneStateId(teamId: string, hedwigUserId: string): Promise<string | null> {
  const cached = doneStateIdCache.get(teamId);
  if (cached) return cached;

  try {
    const statesResult = await executeTool('LINEAR_LIST_LINEAR_STATES', hedwigUserId, {
      team_id: teamId,
    });
    const raw = statesResult?.data ?? statesResult ?? {};
    const states = Array.isArray(raw) ? raw : (raw.data ?? raw.states ?? []);
    const doneState = (Array.isArray(states) ? states : []).find(
      (s: any) => s.type === 'completed' || s.name?.toLowerCase() === 'done',
    );
    if (doneState?.id) {
      doneStateIdCache.set(teamId, doneState.id);
      return doneState.id;
    }
  } catch {
    // non-critical
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getConnection(userId: string, provider: ComposioProvider): Promise<ComposioConnectionRecord | null> {
  const { data, error } = await supabase
    .from('composio_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    logger.warn('Failed to load connection', { userId, provider, error: error.message });
    return null;
  }
  return data as ComposioConnectionRecord | null;
}

function executeTool(slug: string, userId: string, input: Record<string, unknown>): Promise<any> {
  return getSdk().tools.execute(slug, {
    userId,
    arguments: input,
    dangerouslySkipVersionCheck: true,
  });
}

async function updateSyncTime(userId: string, provider: ComposioProvider): Promise<void> {
  await supabase
    .from('composio_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider);
}

// ─── QuickBooks ─────────────────────────────────────────────────────────────

export async function syncInvoiceToQuickBooks(params: {
  userId: string;
  invoiceData: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    clientName?: string;
    clientEmail?: string;
    status: string;
    issueDate: string;
    dueDate?: string;
    description?: string;
  };
}): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const conn = await getConnection(params.userId, 'quickbooks');
  if (!conn) return { success: false, error: 'QuickBooks is not connected' };

  const hedwigUserId = userIdFor(params.userId);
  const { invoiceData } = params;

  try {
    const result: any = await executeTool('QUICKBOOKS_CREATE_INVOICE', hedwigUserId, {
      title: invoiceData.title,
      amount: invoiceData.amount,
      currency: invoiceData.currency,
      customer_name: invoiceData.clientName || '',
      customer_email: invoiceData.clientEmail || '',
      status: invoiceData.status,
      issue_date: invoiceData.issueDate,
      due_date: invoiceData.dueDate || '',
      description: invoiceData.description || '',
    });

    await updateSyncTime(params.userId, 'quickbooks');
    return { success: true, externalId: result?.data?.id || result?.data?.Invoice?.Id || '' };
  } catch (error: any) {
    logger.error('QuickBooks sync invoice failed', { userId: params.userId, error: error.message });
    return { success: false, error: error.message || 'Sync to QuickBooks failed' };
  }
}

export async function exportRevenueToQuickBooks(params: {
  userId: string;
  revenueData: {
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    currency: string;
    range: string;
    entries: Array<{
      title: string;
      amount: number;
      date: string;
      clientName?: string;
    }>;
  };
}): Promise<{ success: boolean; count?: number; error?: string }> {
  const conn = await getConnection(params.userId, 'quickbooks');
  if (!conn) return { success: false, error: 'QuickBooks is not connected' };

  const hedwigUserId = userIdFor(params.userId);
  let synced = 0;

  for (const entry of params.revenueData.entries) {
    try {
      await executeTool('QUICKBOOKS_CREATE_INVOICE', hedwigUserId, {
        title: entry.title,
        amount: entry.amount,
        currency: params.revenueData.currency,
        customer_name: entry.clientName || '',
        issue_date: entry.date,
        status: 'Paid',
      });
      synced++;
    } catch (error: any) {
      logger.warn('QuickBooks entry sync failed, continuing', { title: entry.title, error: error.message });
    }
  }

  await updateSyncTime(params.userId, 'quickbooks');
  return { success: true, count: synced };
}

// ─── Xero ───────────────────────────────────────────────────────────────────

export async function pushEntriesToXero(params: {
  userId: string;
  entries: Array<{
    title: string;
    amount: number;
    currency: string;
    date: string;
    type: 'invoice' | 'expense' | 'credit';
    description?: string;
    clientName?: string;
  }>;
}): Promise<{ success: boolean; count?: number; error?: string }> {
  const conn = await getConnection(params.userId, 'xero');
  if (!conn) return { success: false, error: 'Xero is not connected' };

  const hedwigUserId = userIdFor(params.userId);
  let pushed = 0;

  for (const entry of params.entries) {
    try {
      if (entry.type === 'invoice') {
        await executeTool('XERO_CREATE_INVOICE', hedwigUserId, {
          title: entry.title,
          amount: entry.amount,
          currency: entry.currency,
          date: entry.date,
          contact_name: entry.clientName || '',
          description: entry.description || '',
        });
      } else if (entry.type === 'expense') {
        await executeTool('XERO_CREATE_EXPENSE', hedwigUserId, {
          title: entry.title,
          amount: entry.amount,
          currency: entry.currency,
          date: entry.date,
          description: entry.description || '',
        });
      }
      pushed++;
    } catch (error: any) {
      logger.warn('Xero entry push failed, continuing', { title: entry.title, error: error.message });
    }
  }

  await updateSyncTime(params.userId, 'xero');
  return { success: true, count: pushed };
}

// ─── Linear ─────────────────────────────────────────────────────────────────

export async function createLinearProject(params: {
  userId: string;
  projectData: {
    name: string;
    description?: string;
    dueDate?: string;
    assigneeName?: string;
    hedwigProjectId: string;
  };
}): Promise<{ success: boolean; externalId?: string; url?: string; milestonesSynced?: number; error?: string }> {
  const conn = await getConnection(params.userId, 'linear');
  if (!conn) return { success: false, error: 'Linear is not connected' };

  const hedwigUserId = userIdFor(params.userId);

  try {
    // Fetch teams first — Linear requires a teamId to create a project
    const teamsResult = await executeTool('LINEAR_LIST_LINEAR_TEAMS', hedwigUserId, {});
    const teamsRaw = teamsResult?.data ?? teamsResult ?? {};
    const teams = Array.isArray(teamsRaw) ? teamsRaw : (teamsRaw.data ?? teamsRaw.teams ?? []);
    const firstTeam = Array.isArray(teams) ? teams[0] : null;
    if (!firstTeam?.id) {
      return { success: false, error: 'No Linear team found. Create a team in Linear first.' };
    }

    // Fetch current Linear user to set as project lead
    let leadId: string | undefined;
    try {
      const userResult = await executeTool('LINEAR_GET_CURRENT_USER', hedwigUserId, {});
      const userData = userResult?.data ?? userResult ?? {};
      leadId = userData.id || undefined;
    } catch {
      // Non-critical — project will be created without a lead
    }

    const projectArgs: Record<string, unknown> = {
      name: params.projectData.name,
      description: params.projectData.description || '',
      team_ids: [firstTeam.id],
      target_date: params.projectData.dueDate || null,
    };
    if (leadId) projectArgs.lead_id = leadId;

    const result = await executeTool('LINEAR_CREATE_LINEAR_PROJECT', hedwigUserId, projectArgs);

    const data = result?.data ?? result ?? {};
    const projectData = data.projectCreate?.project ?? data.project ?? data;
    const externalId = projectData.id || data.id || '';
    const url = projectData.url || data.url || '';

    // Sync milestones as Linear issues linked to the project
    let milestonesSynced = 0;
    if (externalId && params.projectData.hedwigProjectId) {
      const { data: milestones } = await supabase
        .from('milestones')
        .select('id, title, amount, due_date, status')
        .eq('project_id', params.projectData.hedwigProjectId);

      logger.info('Linear milestone sync', { count: milestones?.length ?? 0, projectId: externalId });

      if (milestones) {
        for (const ms of milestones) {
          try {
            const issueArgs: Record<string, unknown> = {
              title: ms.title,
              team_id: firstTeam.id,
              project_id: externalId,
              description: `**Milestone from Hedwig**\n\nAmount: $${ms.amount ?? 0}\nStatus: ${ms.status || 'pending'}`,
            };
            if (ms.due_date) {
              issueArgs.due_date = ms.due_date.slice(0, 10);
            }
            const msResult = await executeTool('LINEAR_CREATE_LINEAR_ISSUE', hedwigUserId, issueArgs);
            const msData = msResult?.data ?? msResult ?? {};
            const linearIssueId = msData.id || msData.issue?.id || '';
            if (linearIssueId) {
              await supabase
                .from('milestones')
                .update({ linear_milestone_id: linearIssueId })
                .eq('id', ms.id);
            }
            milestonesSynced++;
          } catch (e: any) {
            logger.warn('Failed to sync milestone to Linear', { milestoneId: ms.id, title: ms.title, error: e.message });
          }
        }
      }
    }

    // Store the link between Hedwig project and Linear project
    if (externalId && params.projectData.hedwigProjectId) {
      await supabase
        .from('composio_connections')
        .update({
          metadata: {
            ...(conn.metadata ?? {}),
            linked_projects: {
              ...((conn.metadata as any)?.linked_projects ?? {}),
              [params.projectData.hedwigProjectId]: {
                linearProjectId: externalId,
                linearUrl: url,
                syncedAt: new Date().toISOString(),
              },
            },
          },
        })
        .eq('id', conn.id);
    }

    await updateSyncTime(params.userId, 'linear');
    return { success: true, externalId, url, milestonesSynced };
  } catch (error: any) {
    logger.error('Linear create project failed', { userId: params.userId, error: error.message });
    return { success: false, error: error.message || 'Create in Linear failed' };
  }
}

export async function syncLinearProjectStatus(params: {
  userId: string;
  hedwigProjectId: string;
}): Promise<{
  success: boolean;
  linearStatus?: string;
  linearUrl?: string;
  hedwigStatusUpdated?: boolean;
  milestonesSynced?: number;
  milestonesStatusUpdated?: number;
  error?: string;
}> {
  const conn = await getConnection(params.userId, 'linear');
  if (!conn) return { success: false, error: 'Linear is not connected' };

  const linked = (conn.metadata as any)?.linked_projects?.[params.hedwigProjectId];
  if (!linked?.linearProjectId) {
    return { success: false, error: 'Project is not linked to Linear' };
  }

  const hedwigUserId = userIdFor(params.userId);
  const linearProjectId = linked.linearProjectId;

  try {
    // Fetch team info once — needed for milestone creation and status updates
    const teamsResult = await executeTool('LINEAR_LIST_LINEAR_TEAMS', hedwigUserId, {});
    const teamsRaw = teamsResult?.data ?? teamsResult ?? {};
    const teams = Array.isArray(teamsRaw) ? teamsRaw : (teamsRaw.data ?? teamsRaw.teams ?? []);
    const firstTeam = Array.isArray(teams) ? teams[0] : null;

    // ── 1. Push Hedwig → Linear (project-level) ──────────────────────
    const { data: hedwigProject } = await supabase
      .from('projects')
      .select('name, description, status')
      .eq('id', params.hedwigProjectId)
      .single();

    if (hedwigProject) {
      const HEDWIG_TO_LINEAR: Record<string, string> = {
        ACTIVE: 'started',
        ONGOING: 'started',
        PAUSED: 'paused',
        COMPLETED: 'completed',
        CANCELLED: 'canceled',
        REVIEW: 'review',
        APPROVED: 'approved',
        CHANGES_REQUESTED: 'changes_requested',
      };

      const linearState = HEDWIG_TO_LINEAR[hedwigProject.status?.toUpperCase()];
      const updateArgs: Record<string, unknown> = {
        project_id: linearProjectId,
        name: hedwigProject.name,
        description: hedwigProject.description || '',
      };
      if (linearState) updateArgs.state = linearState;

      await executeTool('LINEAR_UPDATE_LINEAR_PROJECT', hedwigUserId, updateArgs);
    }

    // ── 2. Push new Hedwig milestones → Linear (as issues) ──────────
    let milestonesSynced = 0;
    const { data: unsyncedMilestones } = await supabase
      .from('milestones')
      .select('id, title, amount, due_date, status')
      .eq('project_id', params.hedwigProjectId)
      .is('linear_milestone_id', null);

    if (unsyncedMilestones && firstTeam?.id) {
      for (const ms of unsyncedMilestones) {
        try {
          const issueArgs: Record<string, unknown> = {
            title: ms.title,
            team_id: firstTeam.id,
            project_id: linearProjectId,
            description: `**Milestone from Hedwig**\n\nAmount: $${ms.amount ?? 0}\nStatus: ${ms.status || 'pending'}`,
          };
          if (ms.due_date) {
            issueArgs.due_date = ms.due_date.slice(0, 10);
          }
          const msResult = await executeTool('LINEAR_CREATE_LINEAR_ISSUE', hedwigUserId, issueArgs);
          const msData = msResult?.data ?? msResult ?? {};
          const linearIssueId = msData.id || msData.issue?.id || '';
          if (linearIssueId) {
            await supabase
              .from('milestones')
              .update({ linear_milestone_id: linearIssueId })
              .eq('id', ms.id);
          }
          milestonesSynced++;
        } catch (e: any) {
          logger.warn('Failed to sync milestone to Linear', { milestoneId: ms.id, title: ms.title, error: e.message });
        }
      }
    }

    // ── 3. Bidirectional milestone status sync (via Composio) ────────
    let milestonesStatusUpdated = 0;
    const { data: linkedMilestones } = await supabase
      .from('milestones')
      .select('id, title, status, linear_milestone_id')
      .eq('project_id', params.hedwigProjectId)
      .not('linear_milestone_id', 'is', null);

    if (linkedMilestones && linkedMilestones.length > 0) {
      // Pull: fetch issue statuses from Linear for all linked milestones
      const linearIssuesResult = await executeTool('LINEAR_LIST_LINEAR_ISSUES', hedwigUserId, {
        project_id: linearProjectId,
        first: 250,
      });
      const issuesRaw = linearIssuesResult?.data ?? linearIssuesResult ?? {};
      const issues = Array.isArray(issuesRaw) ? issuesRaw : (issuesRaw.data ?? issuesRaw.issues ?? []);

      if (Array.isArray(issues)) {
        const linearIssueMap = new Map(issues.map((i: any) => [i.id, i]));

        for (const ms of linkedMilestones) {
          if (!ms.linear_milestone_id) continue;
          const linearIssue = linearIssueMap.get(ms.linear_milestone_id);
          if (!linearIssue) continue;

          const hedwigDone = ['invoiced', 'paid'].includes(ms.status);
          const stateName = linearIssue.state?.name || '';
          const stateType = linearIssue.state?.type || '';
          const linearDone = stateType === 'completed' || stateName.toLowerCase() === 'done';

          // Hedwig → Linear (milestone completed in Hedwig, not yet done in Linear)
          if (hedwigDone && !linearDone) {
            try {
              const stateId = await getDoneStateId(firstTeam?.id || '', hedwigUserId);
              if (stateId) {
                await executeTool('LINEAR_UPDATE_ISSUE', hedwigUserId, {
                  issueId: ms.linear_milestone_id,
                  stateId,
                });
                milestonesStatusUpdated++;
              }
            } catch (e: any) {
              logger.warn('Failed to update Linear issue status', { milestoneId: ms.id, linearIssueId: ms.linear_milestone_id, error: e.message });
            }
          }

          // Linear → Hedwig (issue completed in Linear, not yet done in Hedwig)
          if (linearDone && !hedwigDone) {
            const newStatus = ms.status === 'pending' ? 'invoiced' : 'paid';
            await supabase
              .from('milestones')
              .update({ status: newStatus })
              .eq('id', ms.id);
            milestonesStatusUpdated++;
          }
        }
      }
    }

    // ── 4. Pull Linear → Hedwig (project status) ─────────────────────
    const result = await executeTool('LINEAR_GET_LINEAR_PROJECT', hedwigUserId, {
      project_id: linearProjectId,
    });

    const data = result?.data ?? result ?? {};
    const linearStatusName = data.status?.name || data.state || 'Unknown';

    const LINEAR_TO_HEDWIG: Record<string, string> = {
      planned: 'active',
      started: 'active',
      paused: 'paused',
      completed: 'completed',
      canceled: 'cancelled',
      cancelled: 'cancelled',
      review: 'review',
      approved: 'approved',
      changes_requested: 'changes_requested',
      in_progress: 'active',
    };

    const hedwigStatus = LINEAR_TO_HEDWIG[linearStatusName.toLowerCase()];
    let hedwigStatusUpdated = false;

    if (hedwigStatus) {
      const { error: updateError } = await supabase
        .from('projects')
        .update({ status: hedwigStatus.toUpperCase() })
        .eq('id', params.hedwigProjectId)
        .eq('user_id', params.userId);

      if (!updateError) hedwigStatusUpdated = true;
    }

    const linearUrl = linked.linearUrl || '';

    await updateSyncTime(params.userId, 'linear');
    return { success: true, linearStatus: linearStatusName, linearUrl, hedwigStatusUpdated, milestonesSynced, milestonesStatusUpdated };
  } catch (error: any) {
    logger.error('Linear sync failed', { userId: params.userId, error: error.message });
    return { success: false, error: error.message || 'Could not sync with Linear' };
  }
}

export async function getLinearProjectLink(params: {
  userId: string;
  hedwigProjectId: string;
}): Promise<{ linked: boolean; linearProjectId?: string; linearUrl?: string }> {
  const conn = await getConnection(params.userId, 'linear');
  if (!conn) return { linked: false };

  const linked = (conn.metadata as any)?.linked_projects?.[params.hedwigProjectId];
  if (!linked?.linearProjectId) return { linked: false };

  return { linked: true, linearProjectId: linked.linearProjectId, linearUrl: linked.linearUrl };
}

export async function getAllLinkedProjects(userId: string): Promise<{
  linked: boolean;
  projects: Record<string, { linearProjectId: string; linearUrl: string; syncedAt: string }>;
}> {
  const conn = await getConnection(userId, 'linear');
  if (!conn) return { linked: false, projects: {} };

  const linked = (conn.metadata as any)?.linked_projects ?? {};
  return { linked: true, projects: linked };
}

export async function unlinkLinearProject(params: {
  userId: string;
  hedwigProjectId: string;
}): Promise<{ success: boolean }> {
  const conn = await getConnection(params.userId, 'linear');
  if (!conn) return { success: true };

  const metadata = { ...(conn.metadata ?? {}) } as any;
  if (metadata.linked_projects) {
    delete metadata.linked_projects[params.hedwigProjectId];
  }

  await supabase
    .from('composio_connections')
    .update({ metadata })
    .eq('id', conn.id);

  return { success: true };
}
