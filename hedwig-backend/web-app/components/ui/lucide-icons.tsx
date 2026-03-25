import React from 'react';
import * as Lucide from 'lucide-react';
import type { LucideProps } from 'lucide-react';

type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' | (string & {});

type CompatIconProps = Omit<LucideProps, 'strokeWidth'> & {
  weight?: PhosphorWeight;
  mirrored?: boolean;
};

const weightToStrokeWidth = (weight: PhosphorWeight | undefined): number => {
  switch (weight) {
    case 'thin':
      return 1.25;
    case 'light':
      return 1.5;
    case 'bold':
      return 2.5;
    case 'fill':
      return 2.5;
    case 'duotone':
      return 2.25;
    case 'regular':
    default:
      return 2;
  }
};

const resolveIcon = (name: string) => {
  const lib = Lucide as unknown as Record<string, React.ComponentType<LucideProps>>;
  return lib[name] ?? lib.CircleAlert;
};

const makeIcon = (lucideName: string) => {
  const Icon: React.FC<CompatIconProps> = ({ weight = 'regular', mirrored = false, style, ...props }) => {
    const LucideIcon = resolveIcon(lucideName);
    const mergedStyle = mirrored
      ? ({ ...(style as React.CSSProperties), transform: 'scaleX(-1)' } as React.CSSProperties)
      : style;
    return <LucideIcon strokeWidth={weightToStrokeWidth(weight)} style={mergedStyle} {...props} />;
  };
  Icon.displayName = lucideName;
  return Icon;
};

export const ArrowDown = makeIcon('ArrowDown');
export const ArrowDownRight = makeIcon('ArrowDownRight');
export const ArrowLeft = makeIcon('ArrowLeft');
export const ArrowRight = makeIcon('ArrowRight');
export const ArrowSquareOut = makeIcon('SquareArrowOutUpRight');
export const ArrowUp = makeIcon('ArrowUp');
export const ArrowUpRight = makeIcon('ArrowUpRight');
export const ArrowsClockwise = makeIcon('RefreshCw');
export const ArrowsDownUp = makeIcon('ArrowUpDown');
export const ArrowsLeftRight = makeIcon('ArrowLeftRight');
export const Bank = makeIcon('Landmark');
export const Bell = makeIcon('Bell');
export const BellRinging = makeIcon('BellRing');
export const BellSimple = makeIcon('Bell');
export const BellSlash = makeIcon('BellOff');
export const Buildings = makeIcon('Building2');
export const CalendarBlank = makeIcon('Calendar');
export const CalendarDots = makeIcon('CalendarDays');
export const CalendarPlus = makeIcon('CalendarPlus');
export const Cards = makeIcon('WalletCards');
export const CaretDown = makeIcon('ChevronDown');
export const CaretLeft = makeIcon('ChevronLeft');
export const CaretRight = makeIcon('ChevronRight');
export const ChartBar = makeIcon('BarChart3');
export const Check = makeIcon('Check');
export const CheckCircle = makeIcon('CircleCheck');
export const ClockCountdown = makeIcon('Clock3');
export const Coins = makeIcon('Coins');
export const Copy = makeIcon('Copy');
export const CopySimple = makeIcon('Copy');
export const CreditCard = makeIcon('CreditCard');
export const CurrencyCircleDollar = makeIcon('CircleDollarSign');
export const CurrencyDollar = makeIcon('DollarSign');
export const DotsThreeOutline = makeIcon('Ellipsis');
export const DownloadSimple = makeIcon('Download');
export const Envelope = makeIcon('Mail');
export const Eye = makeIcon('Eye');
export const Faders = makeIcon('SlidersHorizontal');
export const FileText = makeIcon('FileText');
export const FlagPennant = makeIcon('Flag');
export const FolderSimple = makeIcon('Folder');
export const Globe = makeIcon('Globe');
export const House = makeIcon('House');
export const IdentificationCard = makeIcon('IdCard');
export const Info = makeIcon('Info');
export const Key = makeIcon('Key');
export const Lifebuoy = makeIcon('LifeBuoy');
export const Link = makeIcon('Link');
export const LinkSimple = makeIcon('Link');
export const ListPlus = makeIcon('ListPlus');
export const Lock = makeIcon('Lock');
export const MagicWand = makeIcon('WandSparkles');
export const MagnifyingGlass = makeIcon('Search');
export const MapPin = makeIcon('MapPin');
export const Minus = makeIcon('Minus');
export const Moon = makeIcon('Moon');
export const NotePencil = makeIcon('Pencil');
export const PaperPlaneRight = makeIcon('Send');
export const PaperPlaneTilt = makeIcon('Send');
export const Paperclip = makeIcon('Paperclip');
export const PencilSimpleLine = makeIcon('PencilLine');
export const Phone = makeIcon('Phone');
export const Plus = makeIcon('Plus');
export const Printer = makeIcon('Printer');
export const Question = makeIcon('CircleHelp');
export const Receipt = makeIcon('Receipt');
export const Repeat = makeIcon('Repeat');
export const ShareNetwork = makeIcon('Share2');
export const Shield = makeIcon('Shield');
export const ShieldCheck = makeIcon('ShieldCheck');
export const SidebarSimple = makeIcon('PanelLeft');
export const SignIn = makeIcon('LogIn');
export const SignOut = makeIcon('LogOut');
export const Signature = makeIcon('Signature');
export const Sparkle = makeIcon('Sparkles');
export const SpinnerGap = makeIcon('LoaderCircle');
export const Sun = makeIcon('Sun');
export const Target = makeIcon('Target');
export const Trash = makeIcon('Trash2');
export const User = makeIcon('User');
export const UserPlus = makeIcon('UserPlus');
export const UsersThree = makeIcon('Users');
export const Wallet = makeIcon('Wallet');
export const Warning = makeIcon('TriangleAlert');
export const WarningCircle = makeIcon('AlertCircle');
export const X = makeIcon('X');
export const XCircle = makeIcon('CircleX');
export const XLogo = makeIcon('Twitter');
