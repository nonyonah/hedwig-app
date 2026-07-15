export function getWorkspaceIcon(workspace: { name: string; icon?: string | null }): string {
  if (workspace.icon) return workspace.icon;
  return workspace.name.charAt(0).toUpperCase();
}

export function isEmoji(str: string): boolean {
  if (!str) return false;
  return /\p{Emoji}/u.test(str);
}
