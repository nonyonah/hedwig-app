import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('WorkspaceService');

export interface WorkspaceMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expiresAt: string;
  createdAt: string;
}

export const WorkspaceService = {
  async ensurePersonalWorkspace(userId: string) {
    const { data: existing } = await supabase
      .from('workspaces')
      .select('id, name, type')
      .eq('owner_id', userId)
      .eq('type', 'personal')
      .maybeSingle();

    if (existing) return existing;

    const { data: user } = await supabase
      .from('users')
      .select('first_name, last_name, email, created_at')
      .eq('id', userId)
      .single();

    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email || 'My Workspace';

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        id: `ws_personal_${userId}`,
        name,
        type: 'personal',
        owner_id: userId,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create personal workspace', { userId, error: error.message });
      return null;
    }

    await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: 'owner',
    });

    logger.info('Created personal workspace', { userId, workspaceId: workspace.id });
    return workspace;
  },

  async listWorkspaces(userId: string) {
    const { data, error } = await supabase
      .from('workspace_members')
      .select(`
        workspace_id,
        role,
        joined_at,
        workspace:workspaces(id, name, type, owner_id, created_at)
      `)
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to list workspaces', { userId, error: error.message });
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.workspace?.id || row.workspace_id,
      name: row.workspace?.name,
      type: row.workspace?.type,
      ownerId: row.workspace?.owner_id,
      role: row.role as string,
      joinedAt: row.joined_at,
      createdAt: row.workspace?.created_at,
    }));
  },

  async createWorkspace(userId: string, name: string) {
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        name: name.trim(),
        type: 'organization',
        owner_id: userId,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create workspace', { userId, error: error.message });
      throw error;
    }

    await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: 'owner',
    });

    logger.info('Workspace created', { workspaceId: workspace.id, name, userId });
    return workspace;
  },

  async getWorkspace(workspaceId: string, userId: string) {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error || !data) return null;

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role, joined_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) return null;

    return {
      ...data,
      role: membership.role,
      joinedAt: membership.joined_at,
    };
  },

  async updateWorkspace(workspaceId: string, userId: string, updates: { name?: string }) {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership || membership.role !== 'owner') {
      throw new Error('Only workspace owners can update the workspace');
    }

    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();

    const { data, error } = await supabase
      .from('workspaces')
      .update(payload)
      .eq('id', workspaceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteWorkspace(workspaceId: string, userId: string) {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership || membership.role !== 'owner') {
      throw new Error('Only workspace owners can delete the workspace');
    }

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('type')
      .eq('id', workspaceId)
      .single();

    if (workspace?.type === 'personal') {
      throw new Error('Cannot delete your personal workspace');
    }

    const { error } = await supabase.from('workspaces').delete().eq('id', workspaceId);
    if (error) throw error;
  },

  async getMembership(workspaceId: string, userId: string) {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, joined_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return { role: data.role as 'owner' | 'admin' | 'member', joinedAt: data.joined_at };
  },

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await supabase
      .from('workspace_members')
      .select(`
        user_id,
        role,
        joined_at,
        user:users(first_name, last_name, email, avatar)
      `)
      .eq('workspace_id', workspaceId);

    if (error) throw error;

    return (data || []).map((row: any) => ({
      userId: row.user_id,
      role: row.role as WorkspaceMember['role'],
      joinedAt: row.joined_at,
      firstName: row.user?.first_name,
      lastName: row.user?.last_name,
      email: row.user?.email,
      avatar: row.user?.avatar,
    }));
  },

  async updateMemberRole(workspaceId: string, userId: string, targetUserId: string, role: 'admin' | 'member') {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership || membership.role !== 'owner') {
      throw new Error('Only workspace owners can change member roles');
    }

    if (userId === targetUserId) {
      throw new Error('Cannot change your own role');
    }

    const { error } = await supabase
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId);

    if (error) throw error;
  },

  async removeMember(workspaceId: string, userId: string, targetUserId: string) {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('Only owners and admins can remove members');
    }

    if (userId === targetUserId && membership.role === 'owner') {
      throw new Error('Transfer ownership before leaving');
    }

    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId);

    if (error) throw error;
  },

  async createInvitation(workspaceId: string, userId: string, email: string, role: 'admin' | 'member') {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('Only owners and admins can invite members');
    }

    const token = `inv_${Buffer.from(`${workspaceId}_${email}_${Date.now()}`).toString('base64url').slice(0, 32)}`;

    const { data, error } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: workspaceId,
        email: email.toLowerCase().trim(),
        role,
        invited_by: userId,
        token,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const { data, error } = await supabase
      .from('workspace_invitations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      email: row.email,
      role: row.role,
      invitedBy: row.invited_by,
      token: row.token,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  },

  async cancelInvitation(workspaceId: string, userId: string, invitationId: string) {
    const membership = await this.getMembership(workspaceId, userId);
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new Error('Only owners and admins can cancel invitations');
    }

    const { error } = await supabase
      .from('workspace_invitations')
      .update({ status: 'cancelled' })
      .eq('id', invitationId)
      .eq('workspace_id', workspaceId);

    if (error) throw error;
  },

  async getInvitationByToken(token: string) {
    const { data, error } = await supabase
      .from('workspace_invitations')
      .select('*, workspace:workspaces(id, name, owner_id)')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (error || !data) return null;

    if (new Date(data.expires_at) < new Date()) {
      await supabase.from('workspace_invitations').update({ status: 'expired' }).eq('id', data.id);
      return null;
    }

    return data;
  },

  async acceptInvitation(token: string, userId: string) {
    const invitation = await this.getInvitationByToken(token);
    if (!invitation) throw new Error('Invalid or expired invitation');

    const { data: existing } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('workspace_members').insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
      });
    }

    await supabase.from('workspace_invitations').update({ status: 'accepted' }).eq('id', invitation.id);

    return invitation;
  },

  async getEffectiveWorkspace(userId: string, workspaceId?: string | null) {
    if (workspaceId) {
      const membership = await this.getMembership(workspaceId, userId);
      if (membership) return { id: workspaceId, role: membership.role };
    }

    const workspaces = await this.listWorkspaces(userId);
    const personal = workspaces.find((w) => w.type === 'personal');
    return personal ? { id: personal.id, role: personal.role } : null;
  },
};
