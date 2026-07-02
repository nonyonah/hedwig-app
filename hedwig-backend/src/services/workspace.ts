import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { EmailService } from './email';
import crypto from 'crypto';

const logger = createLogger('WorkspaceService');

export interface WorkspaceMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  solanaWalletAddress?: string;
  ethereumWalletAddress?: string;
  stellarPublicKey?: string;
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

  async createWorkspace(userId: string, name: string, type: 'personal' | 'organization' = 'organization') {
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        name: name.trim(),
        type,
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

    if (workspace.type === 'organization') {
      try {
        const { TreasuryService } = await import('./treasury');
        const result = await TreasuryService.createTreasuryWallet(workspace.id);
        if (result) {
          await supabase.from('workspaces').update({
            treasury_base_address: result.address,
          }).eq('id', workspace.id);
          logger.info('Treasury wallet created for workspace', { workspaceId: workspace.id, address: result.address });
        } else {
          logger.warn('Treasury wallet creation deferred', { workspaceId: workspace.id });
        }

        // Stellar treasury wallet creation was here but is disabled until Stellar is re-enabled.
      } catch (walletError: any) {
        logger.warn('Failed to create treasury wallet, will retry async', {
          workspaceId: workspace.id,
          error: walletError?.message || 'Unknown error',
        });
      }
    }

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
        user:users(first_name, last_name, email, avatar, solana_wallet_address, ethereum_wallet_address, stellar_public_key)
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
      solanaWalletAddress: row.user?.solana_wallet_address,
      ethereumWalletAddress: row.user?.ethereum_wallet_address,
      stellarPublicKey: row.user?.stellar_public_key,
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

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    const { data: inviter } = await supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();

    const inviterName = [inviter?.first_name, inviter?.last_name].filter(Boolean).join(' ').trim() || inviter?.email || 'Someone';
    const workspaceName = workspace?.name || 'a workspace';

    const token = `inv_${crypto.randomBytes(24).toString('base64url')}`;

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

    EmailService.sendWorkspaceInvitationEmail({
      to: email.toLowerCase().trim(),
      workspaceName,
      inviterName,
      role,
      invitationToken: token,
    }).catch((emailError) => {
      logger.error('Failed to send workspace invitation email', {
        error: emailError.message,
        inviteId: data.id,
      });
    });

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
    logger.info('Accepting invitation', { token: token.slice(0, 12) + '...', userId });
    const invitation = await this.getInvitationByToken(token);
    if (!invitation) {
      logger.warn('Invitation not found or expired', { token: token.slice(0, 12) + '...' });
      throw new Error('Invalid or expired invitation');
    }

    logger.info('Invitation found', { workspaceId: invitation.workspace_id, email: invitation.email });

    const { data: existing } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      logger.info('Adding member to workspace', { workspaceId: invitation.workspace_id, userId, role: invitation.role });
      const { error: insertError } = await supabase.from('workspace_members').insert({
        workspace_id: invitation.workspace_id,
        user_id: userId,
        role: invitation.role,
      });
      if (insertError) {
        logger.error('Failed to add workspace member', { error: insertError.message });
        throw insertError;
      }
      logger.info('Member added to workspace');
    } else {
      logger.info('Member already exists in workspace');
    }

    await supabase.from('workspace_invitations').update({ status: 'accepted' }).eq('id', invitation.id);
    logger.info('Invitation marked as accepted', { invitationId: invitation.id });

    // Notify the inviter
    try {
      const { data: newMember } = await supabase
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single();

      const { data: inviter } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('id', invitation.invited_by)
        .single();

      const memberName = [newMember?.first_name, newMember?.last_name].filter(Boolean).join(' ') || newMember?.email || 'Someone';
      const workspaceName = invitation.workspace?.name || 'a workspace';

      // In-app notification
      await supabase.from('notifications').insert({
        user_id: invitation.invited_by,
        workspace_id: invitation.workspace_id,
        title: `${memberName} accepted your invitation`,
        message: `${memberName} has joined ${workspaceName} as a ${invitation.role}.`,
        type: 'workspace',
        is_read: false,
        metadata: {
          workspace_id: invitation.workspace_id,
          member_name: memberName,
          role: invitation.role,
        },
      });

      // Email notification
      if (inviter?.email) {
        await EmailService.sendInvitationAcceptedEmail({
          to: inviter.email,
          inviterName: [inviter.first_name, inviter.last_name].filter(Boolean).join(' ') || 'Admin',
          memberName,
          workspaceName,
          role: invitation.role,
        }).catch((e) => {
          logger.warn('Failed to send invitation accepted email', { error: e.message });
        });
      }
    } catch (notifyError: any) {
      logger.warn('Failed to send acceptance notifications', { error: notifyError.message });
    }

    return invitation;
  },

  async getPendingInvitationsByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    const { data, error } = await supabase
      .from('workspace_invitations')
      .select('*, workspace:workspaces(id, name, owner_id)')
      .eq('email', normalized)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch pending invitations', { email: normalized, error: error.message });
      return [];
    }

    return (data || []).filter((inv: any) => {
      if (new Date(inv.expires_at) < new Date()) {
        supabase.from('workspace_invitations').update({ status: 'expired' }).eq('id', inv.id).then(() => {});
        return false;
      }
      return true;
    });
  },

  async getMemberEarnings(userId: string) {
    // Get all workspace memberships for this user
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .neq('role', 'owner');

    const workspaceIds = (memberships || []).map((m: any) => m.workspace_id);
    if (workspaceIds.length === 0) return { totalEarned: 0, projects: [] };

    // Get assigned projects and their invoice earnings
    const { data: assignments } = await supabase
      .from('workspace_project_assignments')
      .select('project_id, workspace_id')
      .eq('user_id', userId);

    const projectIds = (assignments || []).map((a: any) => a.project_id);
    if (projectIds.length === 0) return { totalEarned: 0, projects: [] };

    // Get completed/approved projects with their details
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status, budget')
      .in('id', projectIds)
      .in('status', ['COMPLETED', 'APPROVED']);

    const { data: documents } = await supabase
      .from('documents')
      .select('id, amount, status, project_id, type')
      .in('project_id', projectIds)
      .eq('type', 'INVOICE')
      .eq('status', 'PAID');

    // Calculate earnings per project
    const projectEarnings = (projects || []).map((project: any) => {
      const projectDocs = (documents || []).filter((d: any) => d.project_id === project.id);
      const earned = projectDocs.reduce((sum: number, d: any) => sum + parseFloat(d.amount || '0'), 0);
      return {
        projectId: project.id,
        projectName: project.name,
        status: project.status?.toLowerCase(),
        budgeted: parseFloat(project.budget || '0'),
        earned,
      };
    });

    const totalEarned = projectEarnings.reduce((sum: number, p: any) => sum + p.earned, 0);

    return { totalEarned, projects: projectEarnings };
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
