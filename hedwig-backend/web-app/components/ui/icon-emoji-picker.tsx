'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Bank,
  Bell,
  BellRinging,
  Buildings,
  CalendarBlank,
  CalendarDots,
  ChartBar,
  CheckCircle,
  ClockCountdown,
  Coins,
  Copy,
  CreditCard,
  CurrencyCircleDollar,
  CurrencyDollar,
  DownloadSimple,
  Envelope,
  FileText,
  FlagPennant,
  FolderSimple,
  Globe,
  House,
  IdentificationCard,
  Link as LinkIcon,
  Lock,
  MagicWand,
  MagnifyingGlass,
  MapPin,
  NotePencil,
  PaperPlaneRight,
  PencilSimple,
  Printer,
  Receipt,
  ShareNetwork,
  Shield,
  ShieldCheck,
  Sparkle,
  Target,
  UploadSimple,
  User,
  UserPlus,
  UsersThree,
  Wallet,
} from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';

/* ── Types ─────────────────────────────────────────────────────────────── */

type EmojiCategory = {
  label: string;
  emojis: string[];
};

type PickerTab = 'emoji' | 'icon';

export type PickerResult =
  | { type: 'emoji'; value: string }
  | { type: 'icon'; value: string; color: string };

/* ── Emoji data ────────────────────────────────────────────────────────── */

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    label: 'Frequently used',
    emojis: ['🔥', '✅', '⭐', '💯', '🎉', '👍', '❤️', '🚀', '💡', '🙏', '👏', '✨'],
  },
  {
    label: 'Smileys & People',
    emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥳', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
  },
  {
    label: 'Animals & Nature',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🦠', '🌹', '🌸', '🌺', '🌻', '🌷', '🌿', '🍀', '🌵', '🌲', '🌳', '🌴', '☀️', '🌙', '⭐', '🌈', '☁️', '⚡', '🔥', '💧', '❄️'],
  },
  {
    label: 'Food & Drink',
    emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥝', '🍅', '🫑', '🥕', '🥦', '🌽', '🍄', '🥜', '🌰', '🍞', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🥘', '🍲', '🍜', '🍝', '🍛', '🍣', '🍱', '🥟', '🍦', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵', '🍶', '🍺', '🍻', '🥂', '🥃', '🍸'],
  },
  {
    label: 'Activities',
    emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '⛳', '🏹', '🎣', '🥊', '🥋', '🛹', '🛷', '⛸', '🎿', '🏂', '🏋️', '🤼', '🤸', '🤺', '⛵', '🚣', '🏊', '🤽', '🚴', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎯', '🎳', '🎮', '🎲', '🧩', '🎭', '🎨', '🎪', '🎤', '🎧', '🎶', '🎵', '🎸', '🎺', '🎻', '🥁'],
  },
  {
    label: 'Objects & Symbols',
    emojis: ['💻', '📱', '⌚', '💡', '🔦', '📖', '📕', '📗', '📘', '📙', '📚', '📓', '📔', '📒', '📃', '📑', '🔖', '💰', '💵', '💴', '💶', '💷', '💳', '🧾', '✉️', '📧', '📨', '📩', '📤', '📥', '📦', '📫', '📪', '📬', '📭', '📮', '📝', '✏️', '🖊️', '🖋️', '✒️', '🔏', '🔐', '🔒', '🔓', '🔑', '🗝️', '🔨', '🪛', '🔧', '⚙️', '🔩', '🔗', '🧲', '🔬', '🔭', '📡', '💉', '💊', '🩹', '🚪', '🪑', '🚽', '🚿', '🛁', '🧴', '🧹', '🔫', '💣', '🧯', '🔋', '🔌'],
  },
];

/* ── Icon data ─────────────────────────────────────────────────────────── */

const PICKER_ICONS = [
  'FolderSimple', 'FileText', 'CalendarBlank', 'CalendarDots',
  'Bell', 'BellRinging', 'ClockCountdown', 'Target',
  'ChartBar', 'CurrencyDollar', 'CurrencyCircleDollar', 'Wallet',
  'CreditCard', 'Bank', 'Coins', 'Receipt',
  'User', 'UsersThree', 'UserPlus', 'IdentificationCard',
  'Buildings', 'House', 'MapPin', 'Globe',
  'Envelope', 'PaperPlaneRight', 'ShareNetwork', 'Link',
  'Copy', 'DownloadSimple', 'UploadSimple', 'Printer',
  'PencilSimple', 'NotePencil', 'MagicWand', 'Sparkle',
  'CheckCircle', 'ShieldCheck', 'Shield', 'Lock',
  'FlagPennant',
];

/* ── Icon grid component (renders with dynamic color) ──────────────────── */

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Bank, Bell, BellRinging, Buildings, CalendarBlank, CalendarDots,
  ChartBar, CheckCircle, ClockCountdown, Coins, Copy, CreditCard,
  CurrencyCircleDollar, CurrencyDollar, DownloadSimple, Envelope,
  FileText, FlagPennant, FolderSimple, Globe, House, IdentificationCard,
  Link: LinkIcon, Lock, MagicWand, MapPin, NotePencil, PaperPlaneRight,
  PencilSimple, Printer, Receipt, ShareNetwork, Shield, ShieldCheck,
  Sparkle, Target, UploadSimple, User, UserPlus, UsersThree, Wallet,
};

function IconGrid({
  search,
  color,
  selected,
  onSelect,
}: {
  search: string;
  color: string;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return PICKER_ICONS;
    const q = search.toLowerCase();
    return PICKER_ICONS.filter((name) => name.toLowerCase().includes(q));
  }, [search]);

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
        No icons found
      </p>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {filtered.map((name) => {
        const IconComponent = ICON_MAP[name];
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              selected === name
                ? 'bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]'
                : 'hover:bg-[var(--color-surface-secondary)]'
            )}
            title={name}
          >
            {IconComponent ? (
              <IconComponent className="h-5 w-5" weight="bold" style={{ color }} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Color Picker ──────────────────────────────────────────────────────── */

const PRESET_COLORS = [
  '#0d47a1', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa',
  '#7c3aed', '#8b5cf6', '#a78bfa', '#db2777', '#ec4899',
  '#dc2626', '#ef4444', '#ea580c', '#f97316', '#d97706',
  '#ca8a04', '#eab308', '#16a34a', '#22c55e', '#4ade80',
  '#14b8a6', '#06b6d4', '#0891b2', '#6366f1',
];

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function isValidHex(s: string) {
  return HEX_RE.test(s.replace('#', ''));
}

function normalizeHex(s: string) {
  const h = s.replace('#', '');
  return `#${h.toLowerCase()}`;
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [input, setInput] = useState(value.replace('#', ''));
  const [showPresets, setShowPresets] = useState(false);

  const handleInputChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setInput(cleaned);
    if (cleaned.length === 6) {
      onChange(`#${cleaned.toLowerCase()}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v.replace('#', ''));
              onChange(v);
            }}
            className="absolute inset-0 h-8 w-8 cursor-pointer opacity-0"
          />
          <div
            className="h-8 w-8 rounded-lg border border-[var(--color-border)]"
            style={{ backgroundColor: value }}
          />
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="000000"
          maxLength={6}
          className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1 text-[12px] font-mono text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
        />
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{value.toUpperCase()}</span>
        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          className="ml-auto text-[11px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
        >
          {showPresets ? 'Less' : 'More'}
        </button>
      </div>
      {showPresets && (
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setInput(c.replace('#', ''));
                onChange(c);
              }}
              className={cn(
                'h-6 w-6 rounded-md border transition-transform hover:scale-110',
                value === c ? 'border-[var(--color-foreground)] ring-1 ring-[var(--color-foreground)]' : 'border-[var(--color-border)]'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Emoji Grid ────────────────────────────────────────────────────────── */

function EmojiGrid({
  search,
  selected,
  onSelect,
}: {
  search: string;
  selected: string | null;
  onSelect: (emoji: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES;
    const q = search.toLowerCase();
    return EMOJI_CATEGORIES.map((cat) => ({
      ...cat,
      emojis: cat.emojis.filter((e) => e.toLowerCase().includes(q)),
    })).filter((cat) => cat.emojis.length > 0);
  }, [search]);

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
        No emojis found
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.map((cat) => (
        <div key={cat.label}>
          <p className="mb-1.5 text-[11px] font-medium text-[var(--color-text-tertiary)]">{cat.label}</p>
          <div className="grid grid-cols-10 gap-0.5">
            {cat.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-[18px] transition-colors',
                  selected === emoji
                    ? 'bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]'
                    : 'hover:bg-[var(--color-surface-secondary)]'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Picker Component ─────────────────────────────────────────────── */

export function IconEmojiPicker({
  initialColor = '#0d47a1',
  onSelect,
  onClose,
}: {
  initialColor?: string;
  onSelect: (result: PickerResult) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<PickerTab>('emoji');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState(initialColor);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleTabChange = (t: PickerTab) => {
    setTab(t);
    setSearch('');
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const handleEmojiSelect = (emoji: string) => {
    setSelectedEmoji(emoji);
    onSelect({ type: 'emoji', value: emoji });
    onClose();
  };

  const handleIconSelect = (name: string) => {
    setSelectedIcon(name);
    onSelect({ type: 'icon', value: name, color });
    onClose();
  };

  return (
    <div className="w-[340px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)]">
        {(['emoji', 'icon'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTabChange(t)}
            className={cn(
              'relative flex-1 px-4 py-2.5 text-[13px] font-medium transition-colors',
              tab === t
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            )}
          >
            {t === 'emoji' ? 'Emojis' : 'Icons'}
            {tab === t && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative border-b border-[var(--color-border)] px-3 py-2">
        <MagnifyingGlass className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" weight="bold" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'emoji' ? 'Search emojis...' : 'Search icons...'}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] py-1.5 pl-8 pr-3 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-accent)]"
          autoFocus
        />
      </div>

      {/* Color picker (icons tab only) */}
      {tab === 'icon' && (
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <ColorPicker value={color} onChange={setColor} />
        </div>
      )}

      {/* Grid */}
      <div className="overflow-y-auto px-3 py-3" style={{ maxHeight: 300 }}>
        {tab === 'emoji' ? (
          <EmojiGrid search={search} selected={selectedEmoji} onSelect={handleEmojiSelect} />
        ) : (
          <IconGrid search={search} color={color} selected={selectedIcon} onSelect={handleIconSelect} />
        )}
      </div>
    </div>
  );
}
