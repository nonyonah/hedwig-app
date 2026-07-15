import { supabase } from '../lib/supabase';

export interface CreateTimeEntryInput {
  projectId?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  durationSeconds?: number;
  hourlyRate?: number;
  status?: 'running' | 'stopped' | 'manual';
  assignedTo?: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  workspaceId: string;
  projectId: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  hourlyRate: number | null;
  billableAmount: number | null;
  status: 'running' | 'stopped' | 'manual' | 'billed';
  createdAt: string;
  updatedAt: string;
  assignedTo: string | null;
  project?: { id: string; name: string; client?: { id: string; name: string } };
}

export interface TimeSummary {
  hoursToday: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
  billableAmount: number;
  topClient: { id: string; name: string; hours: number } | null;
  topProject: { id: string; name: string; hours: number } | null;
}

export const TimeEntriesService = {
  async create(userId: string, workspaceId: string, input: CreateTimeEntryInput): Promise<TimeEntry> {
    if (input.status === 'running') {
      const query = supabase
        .from('time_entries')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'running');

      if (input.projectId) {
        query.eq('project_id', input.projectId);
      } else {
        query.is('project_id', null);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        const msg = input.projectId
          ? 'A timer is already running for this project.'
          : 'You already have a running timer without a project.';
        throw new Error(msg);
      }
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        project_id: input.projectId || null,
        description: input.description || null,
        start_time: input.startTime || new Date().toISOString(),
        end_time: input.endTime || null,
        duration_seconds: input.durationSeconds || null,
        hourly_rate: input.hourlyRate || null,
        assigned_to: input.assignedTo || null,
        status: input.status || 'stopped',
      })
      .select('*, project:projects(id, name, client:clients(id, name))')
      .single();

    if (error) throw error;
    return mapEntry(data);
  },

  async list(
    userId: string,
    workspaceId: string,
    filters?: { from?: string; to?: string; projectId?: string; status?: string },
  ): Promise<TimeEntry[]> {
    let query = supabase
      .from('time_entries')
      .select('*, project:projects(id, name, client:clients(id, name))')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('start_time', { ascending: false })
      .limit(100);

    if (filters?.from) query = query.gte('start_time', filters.from);
    if (filters?.to) query = query.lte('start_time', filters.to);
    if (filters?.projectId) query = query.eq('project_id', filters.projectId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapEntry);
  },

  async getActive(userId: string, workspaceId: string, projectId?: string): Promise<TimeEntry | null> {
    const query = supabase
      .from('time_entries')
      .select('*, project:projects(id, name, client:clients(id, name))')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'running');

    if (projectId) {
      query.eq('project_id', projectId);
    }

    const { data } = await query.maybeSingle();
    return data ? mapEntry(data) : null;
  },

  async getAllActive(userId: string, workspaceId: string): Promise<TimeEntry[]> {
    const { data } = await supabase
      .from('time_entries')
      .select('*, project:projects(id, name, client:clients(id, name))')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'running')
      .order('start_time', { ascending: true });

    return (data || []).map(mapEntry);
  },

  async stop(entryId: string, userId: string): Promise<TimeEntry> {
    const { data: existing } = await supabase
      .from('time_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (!existing) throw new Error('Time entry not found');
    if (existing.status !== 'running') throw new Error('Timer is not running');

    const endTime = new Date().toISOString();
    const start = new Date(existing.start_time).getTime();
    const end = new Date(endTime).getTime();
    const durationSeconds = Math.round((end - start) / 1000);

    const { data, error } = await supabase
      .from('time_entries')
      .update({
        end_time: endTime,
        duration_seconds: durationSeconds,
        status: 'stopped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select('*, project:projects(id, name, client:clients(id, name))')
      .single();

    if (error) throw error;
    return mapEntry(data);
  },

  async update(
    entryId: string,
    userId: string,
    input: Partial<CreateTimeEntryInput>,
  ): Promise<TimeEntry> {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (input.projectId !== undefined) updates.project_id = input.projectId || null;
    if (input.description !== undefined) updates.description = input.description;
    if (input.hourlyRate !== undefined) updates.hourly_rate = input.hourlyRate;
    if (input.durationSeconds !== undefined) updates.duration_seconds = input.durationSeconds;
    if (input.startTime) updates.start_time = input.startTime;
    if (input.endTime) updates.end_time = input.endTime;
    if (input.status) updates.status = input.status;

    const { data, error } = await supabase
      .from('time_entries')
      .update(updates)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select('*, project:projects(id, name, client:clients(id, name))')
      .single();

    if (error) throw error;
    return mapEntry(data);
  },

  async remove(entryId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async getSummary(userId: string, workspaceId: string): Promise<TimeSummary> {
    const now = new Date();
    const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const startOfWeek = (d: Date) => {
      const s = new Date(d);
      s.setDate(s.getDate() - s.getDay());
      return sod(s);
    };
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayStr = sod(now).toISOString();
    const weekStr = startOfWeek(now).toISOString();
    const monthStr = startOfMonth.toISOString();

    const { data: entries } = await supabase
      .from('time_entries')
      .select('duration_seconds, hourly_rate, project_id, project:projects(id, name, client:clients(id, name))')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .gte('start_time', monthStr);

    const rows = (entries || []) as any[];

    const secs = (since: string) =>
      rows
        .filter((r: any) => r.start_time >= since)
        .reduce((s: number, r: any) => s + (r.duration_seconds || 0), 0);

    const hoursToday = secs(todayStr) / 3600;
    const hoursThisWeek = secs(weekStr) / 3600;
    const hoursThisMonth = secs(monthStr) / 3600;

    const billableAmount = rows.reduce((s: number, r: any) => {
      if (r.duration_seconds && r.hourly_rate) {
        return s + (r.duration_seconds / 3600) * Number(r.hourly_rate);
      }
      return s;
    }, 0);

    const clientMap = new Map<string, { id: string; name: string; hours: number }>();
    const projectMap = new Map<string, { id: string; name: string; hours: number }>();

    for (const r of rows) {
      const hrs: number = (r.duration_seconds || 0) / 3600;
      if (r.project?.client) {
        const c: any = r.project.client;
        const existing = clientMap.get(c.id);
        if (existing) existing.hours += hrs;
        else clientMap.set(c.id, { id: c.id, name: c.name, hours: hrs });
      }
      if (r.project) {
        const p: any = r.project;
        const existing = projectMap.get(p.id);
        if (existing) existing.hours += hrs;
        else projectMap.set(p.id, { id: p.id, name: p.name, hours: hrs });
      }
    }

    const topClient = [...clientMap.values()].sort((a, b) => b.hours - a.hours)[0] || null;
    const topProject = [...projectMap.values()].sort((a, b) => b.hours - a.hours)[0] || null;

    return {
      hoursToday,
      hoursThisWeek,
      hoursThisMonth,
      billableAmount,
      topClient,
      topProject,
    };
  },
};

function mapEntry(row: any): TimeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    durationSeconds: row.duration_seconds,
    hourlyRate: row.hourly_rate ? Number(row.hourly_rate) : null,
    billableAmount: row.billable_amount ? Number(row.billable_amount) : null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedTo: row.assigned_to || null,
    project: row.project ? {
      id: row.project.id,
      name: row.project.name,
      client: row.project.client ? { id: row.project.client.id, name: row.project.client.name } : undefined,
    } : undefined,
  };
}
