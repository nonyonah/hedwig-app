import React from 'react';
import { Platform, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { HugeiconsIcon } from '@hugeicons/react-native';
import type { IconSvgElement } from '@hugeicons/react-native';
import {
    Home01Icon as HI_Home01,
    Home as HI_Home,
    Receipt as HI_Receipt,
    Link as HI_Link,
    File02Icon as HI_File02,
    File01Icon as HI_File01,
    Wallet as HI_Wallet,
    Wallet01Icon as HI_Wallet01,
    Settings01Icon as HI_Settings01,
    Settings02Icon as HI_Settings02,
    Copy01Icon as HI_Copy01,
    ClipboardCopy as HI_ClipboardCopy,
    QrCode as HI_QrCode,
    ArrowDown01 as HI_ArrowDown01,
    ArrowDown04Icon as HI_ArrowDown04,
    ArrowDown as HI_ArrowDown,
    ArrowLeft01Icon as HI_ArrowLeft01,
    ArrowLeft04Icon as HI_ArrowLeft04,
    ArrowLeft as HI_ArrowLeft,
    Cancel01Icon as HI_Cancel01,
    Cancel as HI_Cancel,
    ArrowUp01 as HI_ArrowUp01,
    ArrowUp04Icon as HI_ArrowUp04,
    ArrowUp as HI_ArrowUp,
    ArrowUpDown as HI_ArrowUpDown,
    Delete01Icon as HI_Delete01,
    Delete as HI_Delete,
    Scan as HI_Scan,
    History as HI_History,
    TransactionHistoryIcon as HI_TransactionHistory,
    Menu01Icon as HI_Menu01,
    Menu as HI_Menu,
    Clock01Icon as HI_Clock01,
    AlarmClock as HI_AlarmClock,
    CheckCircle as HI_CheckCircle,
    CheckmarkCircle02Icon as HI_CheckmarkCircle02,
    AlertCircle as HI_AlertCircle,
    CircleAlert as HI_CircleAlert,
    AlertTriangle as HI_AlertTriangle,
    CircleUser as HI_CircleUser,
    UserCircleIcon as HI_UserCircle,
    Share08Icon as HI_Share08,
    Share01Icon as HI_Share01,
    Trash as HI_Trash,
    Trash2 as HI_Trash2,
    Notification01Icon as HI_Notification01,
    Bell as HI_Bell,
    MoreHorizontal as HI_MoreHorizontal,
    BankIcon as HI_Bank,
    Banknote as HI_Banknote,
    Refresh as HI_Refresh,
    Search01Icon as HI_Search01,
    Search02Icon as HI_Search02,
    DollarSign as HI_DollarSign,
    CoinsDollarIcon as HI_CoinsDollar,
    Megaphone as HI_Megaphone,
    Megaphone01Icon as HI_Megaphone01,
    ArrowUpRight01Icon as HI_ArrowUpRight01,
    ArrowUpRight as HI_ArrowUpRight,
    ArrowDownLeft01Icon as HI_ArrowDownLeft01,
    ArrowDownLeft as HI_ArrowDownLeft,
    ArrowLeftRight as HI_ArrowLeftRight,
    SentIcon as HI_Sent,
    Send as HI_Send,
    MoneySend01Icon as HI_MoneySend01,
    View as HI_View,
    Eye as HI_Eye,
    ArrowRight01Icon as HI_ArrowRight01,
    ArrowRight04Icon as HI_ArrowRight04,
    ArrowRight as HI_ArrowRight,
    Checkmark as HI_Checkmark,
    Check as HI_Check,
    ShieldAlert as HI_ShieldAlert,
    Lock as HI_Lock,
    CheckSquare as HI_CheckSquare,
    CheckmarkSquare02Icon as HI_CheckmarkSquare02,
    Square as HI_Square,
    Add01Icon as HI_Add01,
    Plus as HI_Plus,
    DocumentAttachmentIcon as HI_DocumentAttachment,
    Briefcase as HI_Briefcase,
    Inbox as HI_Inbox,
    CancelCircleIcon as HI_CancelCircle,
    MessageCircle as HI_MessageCircle,
    Logout01Icon as HI_Logout01,
    Logout as HI_Logout,
    UserGroupIcon as HI_UserGroup,
    BarChart as HI_BarChart,
    ChartBar as HI_ChartBar,
    Calendar as HI_Calendar,
    Download01Icon as HI_Download01,
    Download as HI_Download,
    User as HI_User,
    Mail01Icon as HI_Mail01,
    Mail as HI_Mail,
    ShieldCheck as HI_ShieldCheck,
    Timer01Icon as HI_Timer01,
    Timer as HI_Timer,
    Minus as HI_Minus,
    Bug01Icon as HI_Bug01,
    Bug as HI_Bug,
    Bulb as HI_Bulb,
    Lightbulb as HI_Lightbulb,
    FingerPrintIcon as HI_FingerPrint,
    SquareArrowUpRight02Icon as HI_SquareArrowUpRight02,
    ExternalLink as HI_ExternalLink,
    Flag01Icon as HI_Flag01,
    Flag as HI_Flag,
    Signpost as HI_Signpost,
    MessageSquare as HI_MessageSquare,
    Attachment01Icon as HI_Attachment01,
    Attachment as HI_Attachment,
    ListPlus as HI_ListPlus,
    AddToListIcon as HI_AddToList,
    Phone as HI_Phone,
    Call02Icon as HI_Call02,
    PencilEdit01Icon as HI_PencilEdit01,
    Pencil as HI_Pencil,
    Building02Icon as HI_Building02,
    Building01Icon as HI_Building01,
    Building as HI_Building,
    TrendingUp as HI_TrendingUp,
    AnalyticsUpIcon as HI_AnalyticsUp,
    TrendingDown as HI_TrendingDown,
    AnalyticsDownIcon as HI_AnalyticsDown,
    Sparkles as HI_Sparkles,
    Sparkle as HI_Sparkle,
    Camera01Icon as HI_Camera01,
    Camera as HI_Camera,
    CalendarCheck as HI_CalendarCheck,
    Tag01Icon as HI_Tag01,
    Tag as HI_Tag,
    Coins01Icon as HI_Coins01,
    Bitcoin as HI_Bitcoin,
    Image01Icon as HI_Image01,
    Image02Icon as HI_Image02,
    FileImage as HI_FileImage,
    ThumbsUp as HI_ThumbsUp,
    ThumbsDown as HI_ThumbsDown,
    FolderOpen as HI_FolderOpen,
    Folder as HI_Folder,
    TransactionIcon as HI_Transaction,
    Analytics01Icon as HI_Analytics01,
    ReverseWithdrawal01Icon as HI_ReverseWithdrawal01,
    Folder01Icon as HI_Folder01,
    LogOut as HI_LogOut,
} from '@hugeicons/core-free-icons';
import { useThemeColors } from '../../theme/colors';

let SwiftUIHost: any = null;
let SwiftUIImage: any = null;

if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        SwiftUIHost = swiftUI.Host;
        SwiftUIImage = swiftUI.Image;
    } catch {}
}

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
    | 'FolderOpen'
    | 'Transaction'
    | 'Analytics01'
    | 'ReverseWithdrawal01'
    | 'Folder01';

type IconProps = {
    size?: number;
    color?: string;
    strokeWidth?: number;
    style?: StyleProp<ViewStyle>;
    fill?: string;
};

const ICON_MAP: Record<string, IconSvgElement> = {
    Home01: HI_Home01,
    Home: HI_Home,
    Receipt: HI_Receipt,
    Link: HI_Link,
    File02: HI_File02,
    File01: HI_File01,
    Wallet: HI_Wallet,
    Wallet01: HI_Wallet01,
    Settings01: HI_Settings01,
    Settings02: HI_Settings02,
    Copy01: HI_Copy01,
    ClipboardCopy: HI_ClipboardCopy,
    QrCode: HI_QrCode,
    ArrowDown01: HI_ArrowDown01,
    ArrowDown04: HI_ArrowDown04,
    ArrowDown: HI_ArrowDown,
    ArrowLeft01: HI_ArrowLeft01,
    ArrowLeft04: HI_ArrowLeft04,
    ArrowLeft: HI_ArrowLeft,
    Cancel01: HI_Cancel01,
    Cancel: HI_Cancel,
    ArrowUp01: HI_ArrowUp01,
    ArrowUp04: HI_ArrowUp04,
    ArrowUp: HI_ArrowUp,
    ArrowUpDown: HI_ArrowUpDown,
    Delete01: HI_Delete01,
    Delete: HI_Delete,
    Scan: HI_Scan,
    History: HI_History,
    TransactionHistory: HI_TransactionHistory,
    Menu01: HI_Menu01,
    Menu: HI_Menu,
    Clock01: HI_Clock01,
    AlarmClock: HI_AlarmClock,
    CheckCircle: HI_CheckCircle,
    CheckmarkCircle02: HI_CheckmarkCircle02,
    AlertCircle: HI_AlertCircle,
    CircleAlert: HI_CircleAlert,
    AlertTriangle: HI_AlertTriangle,
    CircleUser: HI_CircleUser,
    UserCircle: HI_UserCircle,
    Share08: HI_Share08,
    Share01: HI_Share01,
    Trash: HI_Trash,
    Trash2: HI_Trash2,
    Notification01: HI_Notification01,
    Bell: HI_Bell,
    MoreHorizontal: HI_MoreHorizontal,
    Bank: HI_Bank,
    Banknote: HI_Banknote,
    Refresh: HI_Refresh,
    Search01: HI_Search01,
    Search02: HI_Search02,
    DollarSign: HI_DollarSign,
    CoinsDollar: HI_CoinsDollar,
    Megaphone: HI_Megaphone,
    Megaphone01: HI_Megaphone01,
    ArrowUpRight01: HI_ArrowUpRight01,
    ArrowUpRight: HI_ArrowUpRight,
    ArrowDownLeft01: HI_ArrowDownLeft01,
    ArrowDownLeft: HI_ArrowDownLeft,
    ArrowLeftRight: HI_ArrowLeftRight,
    Sent: HI_Sent,
    Send: HI_Send,
    MoneySend01: HI_MoneySend01,
    View: HI_View,
    Eye: HI_Eye,
    ArrowRight01: HI_ArrowRight01,
    ArrowRight04: HI_ArrowRight04,
    ArrowRight: HI_ArrowRight,
    Checkmark: HI_Checkmark,
    Check: HI_Check,
    ShieldAlert: HI_ShieldAlert,
    Lock: HI_Lock,
    CheckSquare: HI_CheckSquare,
    CheckmarkSquare02: HI_CheckmarkSquare02,
    Square: HI_Square,
    Add01: HI_Add01,
    Plus: HI_Plus,
    DocumentAttachment: HI_DocumentAttachment,
    Briefcase: HI_Briefcase,
    Inbox: HI_Inbox,
    CancelCircle: HI_CancelCircle,
    MessageCircle: HI_MessageCircle,
    Logout01: HI_Logout01,
    Logout: HI_Logout,
    UserGroup: HI_UserGroup,
    BarChart: HI_BarChart,
    ChartBar: HI_ChartBar,
    Calendar: HI_Calendar,
    Download01: HI_Download01,
    Download: HI_Download,
    User: HI_User,
    Mail01: HI_Mail01,
    Mail: HI_Mail,
    ShieldCheck: HI_ShieldCheck,
    Timer01: HI_Timer01,
    Timer: HI_Timer,
    Minus: HI_Minus,
    Bug01: HI_Bug01,
    Bug: HI_Bug,
    Bulb: HI_Bulb,
    Lightbulb: HI_Lightbulb,
    FingerPrint: HI_FingerPrint,
    SquareArrowUpRight02: HI_SquareArrowUpRight02,
    ExternalLink: HI_ExternalLink,
    Flag01: HI_Flag01,
    Flag: HI_Flag,
    Signpost: HI_Signpost,
    MessageSquare: HI_MessageSquare,
    Attachment01: HI_Attachment01,
    Attachment: HI_Attachment,
    ListPlus: HI_ListPlus,
    AddToList: HI_AddToList,
    Phone: HI_Phone,
    Call02: HI_Call02,
    PencilEdit01: HI_PencilEdit01,
    Pencil: HI_Pencil,
    Building02: HI_Building02,
    Building01: HI_Building01,
    Building: HI_Building,
    TrendingUp: HI_TrendingUp,
    AnalyticsUp: HI_AnalyticsUp,
    TrendingDown: HI_TrendingDown,
    AnalyticsDown: HI_AnalyticsDown,
    Sparkles: HI_Sparkles,
    Sparkle: HI_Sparkle,
    Camera01: HI_Camera01,
    Camera: HI_Camera,
    CalendarCheck: HI_CalendarCheck,
    Tag01: HI_Tag01,
    Tag: HI_Tag,
    Coins01: HI_Coins01,
    Bitcoin: HI_Bitcoin,
    Image01: HI_Image01,
    Image02: HI_Image02,
    FileImage: HI_FileImage,
    ThumbsUp: HI_ThumbsUp,
    ThumbsDown: HI_ThumbsDown,
    FolderOpen: HI_FolderOpen,
    Folder: HI_Folder,
    Transaction: HI_Transaction,
    Analytics01: HI_Analytics01,
    ReverseWithdrawal01: HI_ReverseWithdrawal01,
    Folder01: HI_Folder01,
    LogOut: HI_LogOut,
};

const ICON_CANDIDATES: Record<AppIconName, string[]> = {
    Home: ['Home', 'Home01'],
    Receipt: ['Receipt'],
    Link2: ['Link'],
    FileText: ['File02', 'File01'],
    Wallet2: ['Wallet', 'Wallet01'],
    Settings: ['Settings01', 'Settings02'],
    Copy: ['Copy01', 'ClipboardCopy'],
    QrCode: ['QrCode'],
    ChevronDown: ['ArrowDown04', 'ArrowDown01', 'ArrowDown'],
    ChevronLeft: ['ArrowLeft04', 'ArrowLeft01', 'ArrowLeft'],
    X: ['Cancel01', 'Cancel'],
    ArrowUp: ['ArrowUp04', 'ArrowUp01', 'ArrowUp'],
    ArrowUpDown: ['ArrowUpDown'],
    Delete: ['Delete01', 'Delete'],
    ScanLine: ['Scan', 'QrCode'],
    Wallet: ['Wallet', 'Wallet01'],
    History: ['History', 'TransactionHistory'],
    List: ['Menu01', 'Menu'],
    Clock: ['Clock01', 'AlarmClock'],
    CheckCircle: ['CheckCircle', 'CheckmarkCircle02'],
    AlertCircle: ['AlertCircle', 'CircleAlert'],
    TriangleAlert: ['AlertTriangle'],
    CircleUser: ['CircleUser', 'UserCircle'],
    Share2: ['Share08', 'Share01'],
    Trash: ['Trash', 'Trash2'],
    Bell: ['Notification01', 'Bell'],
    MoreHorizontal: ['MoreHorizontal'],
    Landmark: ['Bank', 'Banknote'],
    ArrowDown: ['ArrowDown04', 'ArrowDown01', 'ArrowDown'],
    RotateCcw: ['Refresh'],
    Search: ['Search01', 'Search02'],
    DollarSign: ['DollarSign', 'CoinsDollar'],
    Megaphone: ['Megaphone', 'Megaphone01'],
    Link: ['Link'],
    ArrowUpRight: ['ArrowUpRight01', 'ArrowUpRight'],
    ArrowDownLeft: ['ArrowDownLeft01', 'ArrowDownLeft'],
    ArrowLeftRight: ['ArrowLeftRight'],
    CircleCheck: ['CheckCircle', 'CheckmarkCircle02'],
    Send: ['Sent', 'Send', 'MoneySend01'],
    Eye: ['View', 'Eye'],
    Ellipsis: ['MoreHorizontal'],
    ChevronRight: ['ArrowRight04', 'ArrowRight01', 'ArrowRight'],
    Check: ['Checkmark', 'Check'],
    ShieldAlert: ['ShieldAlert'],
    Lock: ['Lock'],
    CircleAlert: ['AlertCircle', 'CircleAlert'],
    SquareCheck: ['CheckSquare', 'CheckmarkSquare02'],
    Square: ['Square'],
    Plus: ['Add01', 'Plus'],
    ScrollText: ['File02', 'DocumentAttachment'],
    Briefcase: ['Briefcase'],
    Inbox: ['Inbox'],
    CircleX: ['CancelCircle', 'Cancel'],
    House: ['Home', 'Home01'],
    MessageCircle: ['MessageCircle'],
    LogOut: ['Logout01', 'Logout', 'LogOut'],
    Users: ['UserGroup', 'Team'],
    ChartBar: ['BarChart', 'ChartBar'],
    Calendar: ['Calendar'],
    Download: ['Download01', 'Download'],
    User: ['User', 'UserCircle'],
    Mail: ['Mail01', 'Mail'],
    ShieldCheck: ['ShieldCheck'],
    ArrowRight: ['ArrowRight04', 'ArrowRight01', 'ArrowRight'],
    Timer: ['Timer01', 'Timer'],
    Minus: ['Minus'],
    Bug: ['Bug01', 'Bug'],
    Lightbulb: ['Bulb', 'Lightbulb'],
    Fingerprint: ['FingerPrint'],
    SquareArrowOutUpRight: ['SquareArrowUpRight02', 'ExternalLink'],
    Flag: ['Flag01', 'Flag'],
    Signpost: ['Signpost'],
    MessageSquare: ['MessageSquare'],
    Paperclip: ['Attachment01', 'Attachment'],
    ListPlus: ['ListPlus', 'AddToList'],
    Trash2: ['Trash2', 'Trash'],
    Phone: ['Phone', 'Call02'],
    Pencil: ['PencilEdit01', 'Pencil'],
    Building2: ['Building02', 'Building01', 'Building'],
    TrendingUp: ['ArrowUp04', 'TrendingUp', 'AnalyticsUp'],
    TrendingDown: ['ArrowDown04', 'TrendingDown', 'AnalyticsDown'],
    Sparkles: ['Sparkles', 'Sparkle'],
    Camera: ['Camera01', 'Camera'],
    CalendarCheck: ['CalendarCheck', 'CalendarCheck2'],
    Tag: ['Tag01', 'Tag'],
    Coins: ['Coins01', 'Bitcoin'],
    File: ['File01', 'File02'],
    Image: ['Image01', 'Image02', 'FileImage'],
    ThumbsUp: ['ThumbsUp'],
    ThumbsDown: ['ThumbsDown'],
    RefreshCw: ['Refresh'],
    BarChart3: ['BarChart', 'ChartBar'],
    FolderOpen: ['FolderOpen', 'Folder'],
    Transaction: ['Transaction'],
    Analytics01: ['Analytics01'],
    ReverseWithdrawal01: ['ReverseWithdrawal01'],
    Folder01: ['Folder01'],
};

const SF_SYMBOL_MAP: Partial<Record<AppIconName, string>> = {
    Home: 'house',
    House: 'house',
    Receipt: 'receipt',
    Link2: 'link',
    FileText: 'doc.text',
    Wallet2: 'wallet.pass',
    Wallet: 'wallet.pass',
    Settings: 'gearshape',
    Copy: 'doc.on.doc',
    QrCode: 'qrcode',
    ChevronDown: 'chevron.down',
    ChevronLeft: 'chevron.left',
    ChevronRight: 'chevron.right',
    X: 'xmark',
    CircleX: 'xmark.circle',
    ArrowUp: 'arrow.up',
    ArrowDown: 'arrow.down',
    ArrowRight: 'arrow.right',
    ArrowLeftRight: 'arrow.left.arrow.right',
    ArrowUpDown: 'arrow.up.arrow.down',
    Plus: 'plus',
    Minus: 'minus',
    Check: 'checkmark',
    CheckCircle: 'checkmark.circle',
    CircleCheck: 'checkmark.circle',
    Bell: 'bell',
    Inbox: 'tray',
    Calendar: 'calendar',
    Search: 'magnifyingglass',
    MoreHorizontal: 'ellipsis',
    Ellipsis: 'ellipsis',
    Download: 'arrow.down.circle',
    User: 'person',
    Users: 'person.2',
    Mail: 'envelope',
    Phone: 'phone',
    Pencil: 'pencil',
    Camera: 'camera',
    Image: 'photo',
    FolderOpen: 'folder',
    Folder01: 'folder',
    RefreshCw: 'arrow.clockwise',
    TrendingUp: 'chart.line.uptrend.xyaxis',
    TrendingDown: 'chart.line.downtrend.xyaxis',
    ChartBar: 'chart.bar',
    BarChart3: 'chart.bar',
    Transaction: 'arrow.left.arrow.right',
    ReverseWithdrawal01: 'arrow.uturn.backward.circle',
    Analytics01: 'chart.xyaxis.line',
    ShieldCheck: 'checkmark.shield',
    ShieldAlert: 'exclamationmark.shield',
    Lock: 'lock',
    MessageCircle: 'message',
    MessageSquare: 'text.bubble',
    ThumbsUp: 'hand.thumbsup',
    ThumbsDown: 'hand.thumbsdown',
    Sparkles: 'sparkles',
    Lightbulb: 'lightbulb',
    Flag: 'flag',
    Tag: 'tag',
    DollarSign: 'dollarsign.circle',
    Coins: 'bitcoinsign.circle',
    CalendarCheck: 'calendar.badge.checkmark',
    Trash: 'trash',
    Trash2: 'trash',
    Eye: 'eye',
    Briefcase: 'briefcase',
};

const getHugeicon = (candidate: string): IconSvgElement | null => {
    const raw = ICON_MAP[candidate] as unknown;
    // Hugeicons exports can be object/function-like icon payloads.
    // Accept any non-null value here instead of only arrays.
    if (raw) {
        return raw as IconSvgElement;
    }
    return null;
};

const resolveIcon = (name: AppIconName): IconSvgElement | null => {
    for (const candidate of ICON_CANDIDATES[name]) {
        const icon = getHugeicon(candidate);
        if (icon) return icon;
    }
    return getHugeicon('AlertCircle') || getHugeicon('Cancel01');
};

export function AppIcon({
    name,
    size = 20,
    color,
    strokeWidth = 2.8,
    style,
    fill: _fill,
}: IconProps & { name: AppIconName }) {
    const themeColors = useThemeColors();
    const resolvedColor = color ?? themeColors.textSecondary;
    const icon = resolveIcon(name);
    const sfSymbol = Platform.OS === 'ios' ? SF_SYMBOL_MAP[name] : undefined;

    if (Platform.OS === 'ios' && SwiftUIHost && SwiftUIImage && sfSymbol) {
        return (
            <View style={[{ width: size, height: size }, style]}>
                <SwiftUIHost style={{ width: '100%', height: '100%' }}>
                    <SwiftUIImage systemName={sfSymbol} size={size} color={resolvedColor} />
                </SwiftUIHost>
            </View>
        );
    }

    if (!icon) {
        return (
            <View
                style={[
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        borderWidth: Math.max(1, strokeWidth / 2),
                        borderColor: resolvedColor,
                    },
                    style,
                ]}
            />
        );
    }

    return (
        <HugeiconsIcon
            icon={icon}
            size={size}
            color={resolvedColor}
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
export const Transaction = withName('Transaction');
export const Analytics01 = withName('Analytics01');
export const ReverseWithdrawal01 = withName('ReverseWithdrawal01');
export const Folder01 = withName('Folder01');

export default AppIcon;
