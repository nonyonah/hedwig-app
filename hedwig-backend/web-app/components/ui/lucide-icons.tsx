import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import * as HugeIcons from '@hugeicons/core-free-icons';

type PhosphorWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' | (string & {});

type CompatIconProps = Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon' | 'altIcon' | 'strokeWidth'> & {
  weight?: PhosphorWeight;
  mirrored?: boolean;
};

const iconLibrary = HugeIcons as unknown as Record<string, unknown>;

const isIconSvgElement = (value: unknown): value is IconSvgElement => Array.isArray(value);

const unsafeResolveIcon = (...candidates: string[]): IconSvgElement | undefined => {
  for (const name of candidates) {
    const icon = iconLibrary[name];
    if (isIconSvgElement(icon)) return icon;
  }
  return undefined;
};

const DEFAULT_ICON =
  unsafeResolveIcon('AlertCircleIcon', 'Alert01Icon', 'InformationCircleIcon') ??
  ((iconLibrary.Alert01Icon as IconSvgElement) || ([] as unknown as IconSvgElement));

const resolveIcon = (...candidates: string[]): IconSvgElement => unsafeResolveIcon(...candidates) ?? DEFAULT_ICON;

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

const makeIcon = (...hugeIconCandidates: string[]) => {
  const icon = resolveIcon(...hugeIconCandidates);
  const Icon: React.FC<CompatIconProps> = ({ weight = 'regular', mirrored = false, style, ...props }) => {
    const mergedStyle = mirrored
      ? ({ ...(style as React.CSSProperties), transform: 'scaleX(-1)' } as React.CSSProperties)
      : style;
    return <HugeiconsIcon icon={icon} strokeWidth={weightToStrokeWidth(weight)} style={mergedStyle} {...props} />;
  };
  Icon.displayName = hugeIconCandidates[0] ?? 'HugeIcon';
  return Icon;
};

export const ArrowDown = makeIcon('ArrowDown01Icon');
export const ArrowDownRight = makeIcon('ArrowDownRight01Icon');
export const ArrowLeft = makeIcon('ArrowLeft01Icon');
export const ArrowRight = makeIcon('ArrowRight01Icon');
export const ArrowSquareOut = makeIcon('SquareArrowUpRightIcon', 'SquareArrowUpRight02Icon');
export const ArrowUp = makeIcon('ArrowUp01Icon');
export const ArrowUpRight = makeIcon('ArrowUpRight01Icon');
export const ArrowsClockwise = makeIcon('RefreshIcon');
export const ArrowsDownUp = makeIcon('ArrowUpDownIcon');
export const ArrowsLeftRight = makeIcon('ArrowLeftRightIcon');
export const Bank = makeIcon('BankIcon');
export const Bell = makeIcon('Notification03Icon', 'Notification02Icon');
export const BellRinging = makeIcon('Notification01Icon', 'BellDotIcon');
export const BellSimple = makeIcon('Notification03Icon', 'Notification02Icon');
export const BellSlash = makeIcon('NotificationOff02Icon', 'NotificationOff01Icon');
export const Buildings = makeIcon('Building01Icon');
export const CalendarBlank = makeIcon('Calendar01Icon');
export const CalendarDots = makeIcon('Calendar03Icon');
export const CalendarPlus = makeIcon('CalendarAdd01Icon');
export const Cards = makeIcon('Cards01Icon');
export const CaretDown = makeIcon('ArrowDown01Icon');
export const CaretLeft = makeIcon('ArrowLeft01Icon');
export const CaretRight = makeIcon('ArrowRight01Icon');
export const ChartBar = makeIcon('Analytics01Icon', 'ChartBarLineIcon');
export const Check = makeIcon('Tick01Icon');
export const CheckCircle = makeIcon('CheckmarkCircle01Icon');
export const ClockCountdown = makeIcon('Clock03Icon');
export const Coins = makeIcon('Coins01Icon');
export const Copy = makeIcon('Copy01Icon');
export const CopySimple = makeIcon('Copy01Icon');
export const CreditCard = makeIcon('CreditCardIcon');
export const CurrencyCircleDollar = makeIcon('DollarCircleIcon');
export const CurrencyDollar = makeIcon('Dollar01Icon');
export const DotsThreeOutline = makeIcon('MoreHorizontalIcon');
export const DownloadSimple = makeIcon('Download01Icon');
export const Envelope = makeIcon('Mail01Icon');
export const Eye = makeIcon('ViewIcon');
export const Faders = makeIcon('FilterHorizontalIcon');
export const FileText = makeIcon('File02Icon');
export const FlagPennant = makeIcon('Flag01Icon');
export const FolderSimple = makeIcon('Folder01Icon');
export const Globe = makeIcon('Globe02Icon');
export const House = makeIcon('Home01Icon');
export const IdentificationCard = makeIcon('IdIcon');
export const Info = makeIcon('InformationCircleIcon');
export const Key = makeIcon('Key01Icon');
export const Lifebuoy = makeIcon('LifebuoyIcon');
export const Link = makeIcon('Link01Icon');
export const LinkSimple = makeIcon('Link01Icon');
export const ListPlus = makeIcon('TaskAdd01Icon', 'AddToListIcon');
export const Lock = makeIcon('LockIcon');
export const MagicWand = makeIcon('MagicWand01Icon');
export const MagnifyingGlass = makeIcon('Search01Icon');
export const MapPin = makeIcon('MapPinIcon');
export const Minus = makeIcon('MinusSignIcon');
export const Moon = makeIcon('Moon02Icon');
export const NotePencil = makeIcon('Edit01Icon');
export const PaperPlaneRight = makeIcon('SentIcon', 'MailSend01Icon');
export const PaperPlaneTilt = makeIcon('SentIcon', 'MailSend01Icon');
export const Paperclip = makeIcon('AttachmentIcon', 'DocumentAttachmentIcon');
export const PencilSimpleLine = makeIcon('Edit02Icon');
export const PencilSimple = makeIcon('Edit01Icon', 'PencilEdit01Icon');
export const Phone = makeIcon('CallIcon');
export const Play = makeIcon('PlayIcon', 'PlayCircleIcon');
export const Plus = makeIcon('PlusSignIcon');
export const Printer = makeIcon('PrinterIcon');
export const Question = makeIcon('HelpCircleIcon');
export const Receipt = makeIcon('Invoice01Icon');
export const Repeat = makeIcon('RepeatIcon');
export const ShareNetwork = makeIcon('Share08Icon');
export const Shield = makeIcon('Shield01Icon');
export const ShieldCheck = makeIcon('Shield01Icon');
export const SidebarSimple = makeIcon('SidebarLeftIcon');
export const SignIn = makeIcon('Login01Icon');
export const SignOut = makeIcon('Logout01Icon');
export const Signature = makeIcon('SignatureIcon');
export const Sparkle = makeIcon('SparklesIcon');
export const SpinnerGap = makeIcon('Loading03Icon');
export const Sun = makeIcon('Sun03Icon');
export const Target = makeIcon('Target01Icon');
export const Trash = makeIcon('Delete02Icon');
export const User = makeIcon('UserIcon');
export const UserPlus = makeIcon('UserAdd01Icon');
export const UsersThree = makeIcon('UserGroup03Icon');
export const UploadSimple = makeIcon('Upload01Icon');
export const Wallet = makeIcon('Wallet01Icon');
export const Warning = makeIcon('Alert01Icon');
export const WarningCircle = makeIcon('AlertCircleIcon', 'Alert01Icon');
export const X = makeIcon('Cancel01Icon');
export const XCircle = makeIcon('CancelCircleIcon');
export const XLogo = makeIcon('TwitterIcon');
