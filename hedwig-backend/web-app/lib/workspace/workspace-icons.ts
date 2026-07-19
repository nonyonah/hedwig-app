export function getWorkspaceIconDisplay(workspace: { name: string; icon?: string | null }): { type: 'emoji' | 'icon' | 'initial'; value: string; color?: string } {
  const icon = workspace.icon;
  if (!icon) return { type: 'initial', value: workspace.name.charAt(0).toUpperCase() };
  if (icon.startsWith('emoji:')) return { type: 'emoji', value: icon.slice(6) };
  if (icon.startsWith('icon:')) {
    const parts = icon.split(':');
    return { type: 'icon', value: parts[1], color: parts[2] || '#0d47a1' };
  }
  return { type: 'emoji', value: icon };
}

export function isEmoji(str: string): boolean {
  if (!str) return false;
  return /\p{Emoji}/u.test(str);
}
