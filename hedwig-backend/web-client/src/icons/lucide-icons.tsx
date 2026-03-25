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

export const ArrowSquareOut = makeIcon('SquareArrowOutUpRight');
export const CaretDown = makeIcon('ChevronDown');
export const Check = makeIcon('Check');
export const CheckCircle = makeIcon('CircleCheck');
export const CurrencyCircleDollar = makeIcon('CircleDollarSign');
export const DownloadSimple = makeIcon('Download');
export const FileText = makeIcon('FileText');
export const Key = makeIcon('Key');
export const PaperPlaneTilt = makeIcon('Send');
export const Printer = makeIcon('Printer');
export const Shield = makeIcon('Shield');
export const SignIn = makeIcon('LogIn');
export const SpinnerGap = makeIcon('LoaderCircle');
export const Warning = makeIcon('TriangleAlert');
