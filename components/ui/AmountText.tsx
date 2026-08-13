import React from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle, Platform } from 'react-native';
import { useThemeColors } from '../../theme/colors';

type AmountTone = 'in' | 'out' | 'neutral' | 'error' | 'pending';

export interface AmountTextProps extends Omit<TextProps, 'style'> {
    value: number;
    currency?: string | null;
    // "±" prefix for signed money (e.g. "+$430.00").
    signed?: boolean;
    tone?: AmountTone;
    // For "You received" — colorize only the numeric part is the app default.
    colorize?: boolean;
    size?: 'caption' | 'body' | 'title' | 'display';
    weight?: 'medium' | 'bold';
    style?: TextStyle | TextStyle[];
}

const SIZES: Record<NonNullable<AmountTextProps['size']>, Pick<TextStyle, 'fontSize' | 'letterSpacing'>> = {
    caption: { fontSize: 12, letterSpacing: -0.2 },
    body: { fontSize: 15, letterSpacing: -0.3 },
    title: { fontSize: 22, letterSpacing: -0.6 },
    display: { fontSize: 34, letterSpacing: -1.5 },
};

const amountFormatter = (value: number, currency?: string | null): string => {
    const opts: Intl.NumberFormatOptions = {
        style: currency ? 'currency' : 'decimal',
        currency: currency ?? undefined,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    };
    try {
        return new Intl.NumberFormat(undefined, opts).format(value);
    } catch {
        return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
};

/**
 * Central money component. Guarantees tabular numerals (nodrift during live
 * updates) and semantic tone per the Hedwig contract: inflow = emerald,
 * outflow = neutral, failure = error, pending = amber.
 */
export function AmountText({
    value,
    currency = 'USD',
    signed = false,
    tone = 'neutral',
    size = 'body',
    style,
    ...rest
}: AmountTextProps) {
    const theme = useThemeColors();

    const toneColor =
        tone === 'in'
            ? theme.moneyIn
            : tone === 'out'
              ? theme.moneyOut
              : tone === 'error'
                ? theme.error
                : tone === 'pending'
                  ? theme.warning
                  : theme.textPrimary;

    const sign = signed && value !== 0 ? (value < 0 ? '−' : '+ ') : '';

    return (
        <Text
            {...rest}
            style={[
                AmountStyles.base,
                SIZES[size ?? 'body'],
                { color: toneColor },
                ...(Array.isArray(style) ? style : style ? [style] : []),
            ]}
        >
            {sign}
            {amountFormatter(Math.abs(value), currency)}
        </Text>
    );
}

const AmountStyles = StyleSheet.create({
    base: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontVariant: ['tabular-nums'],
        textAlignVertical: 'center',
        // Platform-idiomatic anti-aliasing for money.
        fontWeight: Platform.select({ ios: '600', android: '600' }),
    },
});