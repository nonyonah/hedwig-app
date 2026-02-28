import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import {
    ChartLineUp,
    ArrowsLeftRight,
    ArrowsDownUp,
    ClockCounterClockwise,
    WarningCircle,
    CheckCircle as PhosphorCheckCircle,
    Check as PhosphorCheck,
    X as PhosphorX,
    CaretDown,
} from 'phosphor-react-native';

type AppIconName =
    | 'Home'
    | 'Receipt'
    | 'Link2'
    | 'FileText'
    | 'Wallet2'
    | 'Settings'
    | 'Copy'
    | 'QrCode'
    | 'ChevronDown'
    | 'ChevronLeft'
    | 'X'
    | 'ArrowUp'
    | 'ArrowUpDown'
    | 'Delete'
    | 'ScanLine'
    | 'Wallet'
    | 'History'
    | 'List'
    | 'Clock'
    | 'CheckCircle'
    | 'AlertCircle'
    | 'TriangleAlert'
    | 'CircleUser'
    | 'Share2'
    | 'Trash'
    | 'Bell'
    | 'MoreHorizontal'
    | 'Landmark'
    | 'ArrowDown'
    | 'RotateCcw'
    | 'Search'
    | 'DollarSign'
    | 'Megaphone'
    | 'Link'
    | 'ArrowUpRight'
    | 'ArrowDownLeft'
    | 'ArrowLeftRight'
    | 'CircleCheck'
    | 'Send'
    | 'Eye'
    | 'Ellipsis'
    | 'ChevronRight'
    | 'Check'
    | 'ShieldAlert'
    | 'Lock'
    | 'CircleAlert'
    | 'SquareCheck'
    | 'Square'
    | 'Plus'
    | 'ScrollText'
    | 'Briefcase'
    | 'Inbox'
    | 'CircleX'
    | 'House'
    | 'MessageCircle'
    | 'LogOut'
    | 'Users'
    | 'ChartBar'
    | 'Calendar'
    | 'Download'
    | 'User'
    | 'Mail'
    | 'ShieldCheck'
    | 'ArrowRight'
    | 'Timer'
    | 'Minus'
    | 'Bug'
    | 'Lightbulb'
    | 'Fingerprint'
    | 'SquareArrowOutUpRight'
    | 'Flag'
    | 'Signpost'
    | 'MessageSquare'
    | 'Paperclip'
    | 'ListPlus'
    | 'Trash2'
    | 'Phone'
    | 'Pencil'
    | 'Building2'
    | 'TrendingUp'
    | 'TrendingDown'
    | 'Sparkles'
    | 'Camera'
    | 'CalendarCheck'
    | 'Tag'
    | 'Coins'
    | 'File'
    | 'Image'
    | 'ThumbsUp'
    | 'ThumbsDown'
    | 'RefreshCw'
    | 'BarChart3'
    | 'FolderOpen';

type IconProps = {
    size?: number;
    color?: string;
    strokeWidth?: number;
    style?: StyleProp<ViewStyle>;
    fill?: string;
};

type IconoirComponent = React.ComponentType<any>;

const ICON_CANDIDATES: Record<AppIconName, string[]> = {
    Home: ['HomeSimple', 'Home'],
    Receipt: ['Receipt', 'Page'],
    Link2: ['Link'],
    FileText: ['Page', 'PageEdit', 'PageStar'],
    Wallet2: ['Wallet'],
    Settings: ['Settings'],
    Copy: ['Copy'],
    QrCode: ['QrCode'],
    ChevronDown: ['NavArrowDown', 'ArrowDown'],
    ChevronLeft: ['NavArrowLeft', 'ArrowLeft'],
    X: ['Xmark', 'XmarkCircle'],
    ArrowUp: ['ArrowUp'],
    ArrowUpDown: ['ArrowsUpFromLine', 'TextArrowsUpDown', 'ArrowUp', 'ArrowDown'],
    Delete: ['DeleteCircled', 'Erase'],
    ScanLine: ['ScanQrCode', 'QrCode'],
    Wallet: ['Wallet'],
    History: ['ClockRotateRight', 'Clock'],
    List: ['MenuScale', 'Menu'],
    Clock: ['Clock'],
    CheckCircle: ['CheckCircle', 'BadgeCheck'],
    AlertCircle: ['WarningCircle'],
    TriangleAlert: ['WarningTriangle', 'WarningCircle'],
    CircleUser: ['UserCircle'],
    Share2: ['ShareAndroid', 'ShareIos', 'Share'],
    Trash: ['Trash'],
    Bell: ['Bell'],
    MoreHorizontal: ['MoreHoriz'],
    Landmark: ['Bank'],
    ArrowDown: ['ArrowDown'],
    RotateCcw: ['Refresh', 'RefreshDouble'],
    Search: ['Search'],
    DollarSign: ['DollarCircle', 'Dollar'],
    Megaphone: ['Megaphone'],
    Link: ['Link'],
    ArrowUpRight: ['ArrowUpRight'],
    ArrowDownLeft: ['ArrowDownLeft'],
    ArrowLeftRight: ['ArrowSeparateVertical', 'ArrowSeparate', 'ArrowUnion', 'ArrowRight', 'ArrowLeft'],
    CircleCheck: ['CheckCircle'],
    Send: ['Send', 'SendMail'],
    Eye: ['Eye'],
    Ellipsis: ['MoreHoriz'],
    ChevronRight: ['NavArrowRight', 'ArrowRight'],
    Check: ['Check'],
    ShieldAlert: ['ShieldAlert', 'WarningTriangle'],
    Lock: ['Lock'],
    CircleAlert: ['WarningCircle'],
    SquareCheck: ['CheckSquare'],
    Square: ['Square'],
    Plus: ['Plus'],
    ScrollText: ['Page', 'Text'],
    Briefcase: ['Suitcase'],
    Inbox: ['MailIn', 'MailOut'],
    CircleX: ['XmarkCircle', 'Xmark'],
    House: ['HomeSimple', 'Home'],
    MessageCircle: ['ChatBubble', 'Message'],
    LogOut: ['LogOut'],
    Users: ['Users', 'Group'],
    ChartBar: ['StatsReport', 'GraphUp'],
    Calendar: ['Calendar'],
    Download: ['Download'],
    User: ['User', 'UserCircle'],
    Mail: ['Mail', 'SendMail'],
    ShieldCheck: ['ShieldCheck'],
    ArrowRight: ['ArrowRight'],
    Timer: ['Timer'],
    Minus: ['Minus'],
    Bug: ['Bug'],
    Lightbulb: ['LightBulb'],
    Fingerprint: ['Fingerprint'],
    SquareArrowOutUpRight: ['OpenInWindow', 'OpenNewWindow'],
    Flag: ['Flag'],
    Signpost: ['MapPin', 'Compass'],
    MessageSquare: ['MessageText', 'ChatBubble'],
    Paperclip: ['Attachment'],
    ListPlus: ['Playlist', 'Plus'],
    Trash2: ['Trash'],
    Phone: ['Phone'],
    Pencil: ['EditPencil'],
    Building2: ['Building'],
    TrendingUp: ['StatsUpSquare', 'GraphUp'],
    TrendingDown: ['StatsDownSquare', 'GraphDown'],
    Sparkles: ['Spark'],
    Camera: ['Camera'],
    CalendarCheck: ['CalendarCheck'],
    Tag: ['Tag'],
    Coins: ['CoinsSwap', 'Coins'],
    File: ['Page'],
    Image: ['MediaImage'],
    ThumbsUp: ['ThumbsUp'],
    ThumbsDown: ['ThumbsDown'],
    RefreshCw: ['Refresh'],
    BarChart3: ['StatsUpSquare', 'StatsReport', 'GraphUp'],
    FolderOpen: ['Folder', 'FolderOpen'],
};

let iconoirModule: Record<string, IconoirComponent> | null = null;
let iconoirModuleDefault: Record<string, IconoirComponent> | null = null;

const PHOSPHOR_FORCED_FALLBACKS: Partial<Record<AppIconName, React.ComponentType<any>>> = {
    BarChart3: ChartLineUp,
    ArrowLeftRight: ArrowsLeftRight,
    ArrowUpDown: ArrowsDownUp,
    History: ClockCounterClockwise,
    TriangleAlert: WarningCircle,
    CircleAlert: WarningCircle,
    ShieldAlert: WarningCircle,
    CheckCircle: PhosphorCheckCircle,
    Check: PhosphorCheck,
    X: PhosphorX,
    ChevronDown: CaretDown,
};

const loadIconoir = (): Record<string, IconoirComponent> => {
    if (iconoirModule) return iconoirModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const loaded = require('iconoir-react-native') as Record<string, IconoirComponent> & {
            default?: Record<string, IconoirComponent>;
        };
        iconoirModule = loaded;
        iconoirModuleDefault = loaded.default || null;
        return loaded;
    } catch {
        iconoirModule = {};
        iconoirModuleDefault = {};
        return iconoirModule;
    }
};

const resolveIcon = (name: AppIconName): IconoirComponent | null => {
    const iconoir = loadIconoir();
    const iconoirDefault = iconoirModuleDefault || {};
    for (const candidate of ICON_CANDIDATES[name]) {
        const component = iconoir[candidate] || iconoirDefault[candidate];
        if (component) return component;
    }
    return (
        iconoir.WarningCircle ||
        iconoirDefault.WarningCircle ||
        iconoir.Xmark ||
        iconoirDefault.Xmark ||
        null
    );
};

export function AppIcon({
    name,
    size = 20,
    color = '#111827',
    strokeWidth = 2.8,
    style,
    fill: _fill,
}: IconProps & { name: AppIconName }) {
    const forcedFallback = PHOSPHOR_FORCED_FALLBACKS[name];
    if (forcedFallback) {
        const ForcedIcon = forcedFallback;
        return (
            <ForcedIcon
                size={size}
                color={color}
                weight="bold"
                style={style}
            />
        );
    }

    const IconComponent = resolveIcon(name);

    if (!IconComponent) {
        return (
            <View
                style={[
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        borderWidth: Math.max(1, strokeWidth / 2),
                        borderColor: color,
                    },
                    style,
                ]}
            />
        );
    }

    return (
        <IconComponent
            width={size}
            height={size}
            color={color}
            strokeWidth={strokeWidth}
            style={style}
        />
    );
}

const withName = (name: AppIconName) => (props: IconProps) => <AppIcon name={name} {...props} />;

export const HomeIcon = withName('Home');
export const ReceiptIcon = withName('Receipt');
export const Link2Icon = withName('Link2');
export const FileTextIcon = withName('FileText');
export const Wallet2Icon = withName('Wallet2');

export const Home = withName('Home');
export const Receipt = withName('Receipt');
export const Link2 = withName('Link2');
export const FileText = withName('FileText');
export const Wallet2 = withName('Wallet2');
export const Settings = withName('Settings');
export const Copy = withName('Copy');
export const QrCode = withName('QrCode');
export const ChevronDown = withName('ChevronDown');
export const ChevronLeft = withName('ChevronLeft');
export const X = withName('X');
export const ArrowUp = withName('ArrowUp');
export const ArrowUpDown = withName('ArrowUpDown');
export const Delete = withName('Delete');
export const ScanLine = withName('ScanLine');
export const Wallet = withName('Wallet');
export const History = withName('History');
export const List = withName('List');
export const Clock = withName('Clock');
export const CheckCircle = withName('CheckCircle');
export const AlertCircle = withName('AlertCircle');
export const TriangleAlert = withName('TriangleAlert');
export const CircleUser = withName('CircleUser');
export const Share2 = withName('Share2');
export const Trash = withName('Trash');
export const Bell = withName('Bell');
export const MoreHorizontal = withName('MoreHorizontal');
export const Landmark = withName('Landmark');
export const ArrowDown = withName('ArrowDown');
export const RotateCcw = withName('RotateCcw');
export const Search = withName('Search');
export const DollarSign = withName('DollarSign');
export const Megaphone = withName('Megaphone');
export const Link = withName('Link');
export const ArrowUpRight = withName('ArrowUpRight');
export const ArrowDownLeft = withName('ArrowDownLeft');
export const ArrowLeftRight = withName('ArrowLeftRight');
export const CircleCheck = withName('CircleCheck');
export const Send = withName('Send');
export const Eye = withName('Eye');
export const Ellipsis = withName('Ellipsis');
export const ChevronRight = withName('ChevronRight');
export const Check = withName('Check');
export const ShieldAlert = withName('ShieldAlert');
export const Lock = withName('Lock');
export const CircleAlert = withName('CircleAlert');
export const SquareCheck = withName('SquareCheck');
export const Square = withName('Square');
export const Plus = withName('Plus');
export const ScrollText = withName('ScrollText');
export const Briefcase = withName('Briefcase');
export const Inbox = withName('Inbox');
export const CircleX = withName('CircleX');
export const House = withName('House');
export const MessageCircle = withName('MessageCircle');
export const LogOut = withName('LogOut');
export const Users = withName('Users');
export const ChartBar = withName('ChartBar');
export const Calendar = withName('Calendar');
export const Download = withName('Download');
export const User = withName('User');
export const Mail = withName('Mail');
export const ShieldCheck = withName('ShieldCheck');
export const ArrowRight = withName('ArrowRight');
export const Timer = withName('Timer');
export const Minus = withName('Minus');
export const Bug = withName('Bug');
export const Lightbulb = withName('Lightbulb');
export const Fingerprint = withName('Fingerprint');
export const SquareArrowOutUpRight = withName('SquareArrowOutUpRight');
export const Flag = withName('Flag');
export const Signpost = withName('Signpost');
export const MessageSquare = withName('MessageSquare');
export const Paperclip = withName('Paperclip');
export const ListPlus = withName('ListPlus');
export const Trash2 = withName('Trash2');
export const Phone = withName('Phone');
export const Pencil = withName('Pencil');
export const Building2 = withName('Building2');
export const TrendingUp = withName('TrendingUp');
export const TrendingDown = withName('TrendingDown');
export const Sparkles = withName('Sparkles');
export const Camera = withName('Camera');
export const CalendarCheck = withName('CalendarCheck');
export const Tag = withName('Tag');
export const Coins = withName('Coins');
export const File = withName('File');
export const Image = withName('Image');
export const ThumbsUp = withName('ThumbsUp');
export const ThumbsDown = withName('ThumbsDown');
export const RefreshCw = withName('RefreshCw');
export const BarChart3 = withName('BarChart3');
export const FolderOpen = withName('FolderOpen');

export default AppIcon;
