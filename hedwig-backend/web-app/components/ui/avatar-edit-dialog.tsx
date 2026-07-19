'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ui/icon-emoji-picker';
import { MagnifyingGlass, UploadSimple, X } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';

/* ── Re-import the icon map and emoji data ─────────────────────────────── */

import {
  Bank, Bell, BellRinging, Buildings, CalendarBlank, CalendarDots,
  ChartBar, CheckCircle, ClockCountdown, Coins, Copy, CreditCard,
  CurrencyCircleDollar, CurrencyDollar, DownloadSimple, Envelope,
  FileText, FlagPennant, FolderSimple, Globe, House, IdentificationCard,
  Link as LinkIcon, Lock, MagicWand, MapPin, NotePencil, PaperPlaneRight,
  Printer, Receipt, ShareNetwork, Shield, ShieldCheck,
  Sparkle, Target, UploadSimple as UploadIcon, User, UserPlus, UsersThree, Wallet,
} from '@/components/ui/lucide-icons';

const ICON_MAP_AVATAR: Record<string, React.ComponentType<any>> = {
  Bank, Bell, BellRinging, Buildings, CalendarBlank, CalendarDots,
  ChartBar, CheckCircle, ClockCountdown, Coins, Copy, CreditCard,
  CurrencyCircleDollar, CurrencyDollar, DownloadSimple, Envelope,
  FileText, FlagPennant, FolderSimple, Globe, House, IdentificationCard,
  Link: LinkIcon, Lock, MagicWand, MapPin, NotePencil, PaperPlaneRight,
  Printer, Receipt, ShareNetwork, Shield, ShieldCheck,
  Sparkle, Target, UploadIcon, User, UserPlus, UsersThree, Wallet,
};

const AVATAR_PICKER_ICONS = Object.keys(ICON_MAP_AVATAR);

type AvatarTab = 'emoji' | 'icon' | 'image';

type AvatarValue =
  | { type: 'emoji'; value: string }
  | { type: 'icon'; value: string; color: string }
  | { type: 'image'; value: string };

/* ── Emoji categories (same as picker) ─────────────────────────────────── */

const EMOJI_CATS = [
  { label: 'Frequently used', emojis: ['🔥', '✅', '⭐', '💯', '🎉', '👍', '❤️', '🚀', '💡', '🙏', '👏', '✨'] },
  { label: 'Smileys & People', emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥳', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
  { label: 'Animals & Nature', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🦠', '🌹', '🌸', '🌺', '🌻', '🌷', '🌿', '🍀', '🌵', '🌲', '🌳', '🌴', '☀️', '🌙', '⭐', '🌈', '☁️', '⚡', '🔥', '💧', '❄️'] },
  { label: 'Food & Drink', emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥝', '🍅', '🫑', '🥕', '🥦', '🌽', '🍄', '🥜', '🌰', '🍞', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🥘', '🍲', '🍜', '🍝', '🍛', '🍣', '🍱', '🥟', '🍦', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵', '🍶', '🍺', '🍻', '🥂', '🥃', '🍸'] },
  { label: 'Activities', emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '⛳', '🏹', '🎣', '🥊', '🥋', '🛹', '🛷', '⛸', '🎿', '🏂', '🏋️', '🤼', '🤸', '🤺', '⛵', '🚣', '🏊', '🤽', '🚴', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎯', '🎳', '🎮', '🎲', '🧩', '🎭', '🎨', '🎪', '🎤', '🎧', '🎶', '🎵', '🎸', '🎺', '🎻', '🥁'] },
  { label: 'Objects & Symbols', emojis: ['💻', '📱', '⌚', '💡', '🔦', '📖', '📕', '📗', '📘', '📙', '📚', '📓', '📔', '📒', '📃', '📑', '🔖', '💰', '💵', '💴', '💶', '💷', '💳', '🧾', '✉️', '📧', '📨', '📩', '📤', '📥', '📦', '📫', '📪', '📬', '📭', '📮', '📝', '✏️', '🖊️', '🖋️', '✒️', '🔏', '🔐', '🔒', '🔓', '🔑', '🗝️', '🔨', '🪛', '🔧', '⚙️', '🔩', '🔗', '🧲', '🔬', '🔭', '📡', '💉', '💊', '🩹', '🚪', '🪑', '🚽', '🚿', '🛁', '🧴', '🧹', '🔫', '💣', '🧯', '🔋', '🔌'] },
];

/* ── Props ─────────────────────────────────────────────────────────────── */

interface AvatarEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSrc?: string | null;
  onSave: (avatar: AvatarValue) => void;
  saving?: boolean;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function AvatarEditDialog({
  open,
  onOpenChange,
  currentSrc,
  onSave,
  saving,
}: AvatarEditDialogProps) {
  const [tab, setTab] = useState<AvatarTab>('emoji');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('#0d47a1');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTabChange = (t: AvatarTab) => {
    setTab(t);
    setSearch('');
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedEmoji(null);
    setSelectedIcon(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    setSelectedEmoji(null);
    setSelectedIcon(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = () => {
    if (tab === 'emoji' && selectedEmoji) {
      onSave({ type: 'emoji', value: selectedEmoji });
    } else if (tab === 'icon' && selectedIcon) {
      onSave({ type: 'icon', value: selectedIcon, color });
    } else if (tab === 'image' && previewUrl) {
      onSave({ type: 'image', value: previewUrl });
    }
  };

  const emojiSearch = (emoji: string) => {
    if (!search.trim()) return true;
    return emoji.toLowerCase().includes(search.toLowerCase());
  };

  const iconSearch = (name: string) => {
    if (!search.trim()) return true;
    return name.toLowerCase().includes(search.toLowerCase());
  };

  const canSave = (tab === 'emoji' && selectedEmoji) || (tab === 'icon' && selectedIcon) || (tab === 'image' && previewUrl);

  const previewContent = tab === 'emoji' && selectedEmoji ? (
    <span className="text-[28px]">{selectedEmoji}</span>
  ) : tab === 'icon' && selectedIcon ? (
    (() => {
      const Ic = ICON_MAP_AVATAR[selectedIcon];
      return Ic ? <Ic className="h-7 w-7" weight="bold" style={{ color }} /> : null;
    })()
  ) : tab === 'image' && previewUrl ? (
    <img src={previewUrl} alt="Preview" className="h-full w-full rounded-full object-cover" />
  ) : currentSrc ? (
    <img src={currentSrc} alt="Current" className="h-full w-full rounded-full object-cover" />
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit avatar</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Preview */}
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] ring-2 ring-[var(--color-border)]">
              {previewContent}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border)]">
            {(['emoji', 'icon', 'image'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTabChange(t)}
                className={cn(
                  'relative flex-1 px-4 py-2 text-[13px] font-medium transition-colors',
                  tab === t
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                )}
              >
                {t === 'emoji' ? 'Emoji' : t === 'icon' ? 'Icon' : 'Upload image'}
                {tab === t && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--color-accent)]" />
                )}
              </button>
            ))}
          </div>

          {/* Search (emoji + icon tabs) */}
          {(tab === 'emoji' || tab === 'icon') && (
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" weight="bold" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'emoji' ? 'Search emojis...' : 'Search icons...'}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pl-9 pr-3 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-accent)]"
                autoFocus
              />
            </div>
          )}

          {/* Color picker (icon tab) */}
          {tab === 'icon' && (
            <ColorPicker value={color} onChange={setColor} />
          )}

          {/* Grids */}
          {tab === 'emoji' && (
            <div className="overflow-y-auto space-y-4" style={{ maxHeight: 280 }}>
              {EMOJI_CATS.map((cat) => {
                const filtered = cat.emojis.filter(emojiSearch);
                if (filtered.length === 0) return null;
                return (
                  <div key={cat.label}>
                    <p className="mb-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">{cat.label}</p>
                    <div className="grid grid-cols-10 gap-0.5">
                      {filtered.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => { setSelectedEmoji(emoji); setPreviewUrl(null); setSelectedIcon(null); }}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg text-[18px] transition-colors',
                            selectedEmoji === emoji
                              ? 'bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]'
                              : 'hover:bg-[var(--color-surface-secondary)]'
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'icon' && (
            <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
              {AVATAR_PICKER_ICONS.filter(iconSearch).length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">No icons found</p>
              ) : (
                <div className="grid grid-cols-8 gap-1">
                  {AVATAR_PICKER_ICONS.filter(iconSearch).map((name) => {
                    const Ic = ICON_MAP_AVATAR[name];
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => { setSelectedIcon(name); setPreviewUrl(null); setSelectedEmoji(null); }}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                          selectedIcon === name
                            ? 'bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]'
                            : 'hover:bg-[var(--color-surface-secondary)]'
                        )}
                      >
                        {Ic ? <Ic className="h-5 w-5" weight="bold" style={{ color }} /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Image upload tab */}
          {tab === 'image' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors',
                dragOver
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
              )}
            >
              <UploadSimple className="mb-2 h-8 w-8 text-[var(--color-text-placeholder)]" weight="regular" />
              <p className="mb-1 text-[13px] font-medium text-[var(--color-text-secondary)]">
                Drop an image here or click to browse
              </p>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">PNG, JPG, WEBP up to 5MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {/* Remove button (when image is set) */}
          {tab === 'image' && previewUrl && (
            <button
              type="button"
              onClick={handleRemove}
              className="mx-auto flex items-center gap-1 text-[12px] font-medium text-[var(--color-danger)] hover:text-[var(--color-danger)]/80"
            >
              <X className="h-3.5 w-3.5" weight="bold" />
              Remove photo
            </button>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { AvatarValue };
