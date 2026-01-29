import React from 'react';
import { Image, StyleSheet, ImageSourcePropType } from 'react-native';

interface ContractIconProps {
    status: string;
    size?: number;
}

/**
 * Colored contract icons based on status
 * These icons provide a more vibrant, iOS-like aesthetic
 */
export function ContractIcon({ status, size = 48 }: ContractIconProps) {
    const getIconSource = (): ImageSourcePropType => {
        switch (status.toUpperCase()) {
            case 'COMPLETED':
            case 'PAID':
            case 'APPROVED':
            case 'SIGNED':
                return require('../../assets/icons/contracts/active.png');

            case 'SENT':
            case 'ACTIVE':
            case 'VIEWED':
                return require('../../assets/icons/contracts/sent.png');

            case 'CANCELLED':
            case 'REJECTED':
                return require('../../assets/icons/contracts/rejected.png');

            case 'DRAFT':
            default:
                return require('../../assets/icons/contracts/draft.png');
        }
    };

    return (
        <Image
            source={getIconSource()}
            style={[styles.icon, { width: size, height: size }]}
            resizeMode="contain"
        />
    );
}

const styles = StyleSheet.create({
    icon: {
        borderRadius: 12,
    },
});

export default ContractIcon;
