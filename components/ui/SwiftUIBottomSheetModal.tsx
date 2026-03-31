import React from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';

let SwiftUIHost: any = null;
let SwiftUIBottomSheet: any = null;
let SwiftUIGroup: any = null;
let SwiftUIRNHostView: any = null;
let SwiftUIScrollView: any = null;
let presentationDetentsModifier: any = null;
let presentationDragIndicatorModifier: any = null;

if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        SwiftUIHost = swiftUI.Host;
        SwiftUIBottomSheet = swiftUI.BottomSheet;
        SwiftUIGroup = swiftUI.Group;
        SwiftUIRNHostView = swiftUI.RNHostView;
        SwiftUIScrollView = swiftUI.ScrollView;

        const swiftUIModifiers = require('@expo/ui/swift-ui/modifiers');
        presentationDetentsModifier = swiftUIModifiers.presentationDetents;
        presentationDragIndicatorModifier = swiftUIModifiers.presentationDragIndicator;
    } catch {}
}

type SwiftUIBottomSheetModalProps = {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    fitToContents?: boolean;
    useSwiftUIScrollView?: boolean;
    matchContents?: boolean;
    detents?: Array<'medium' | 'large' | { fraction: number } | { height: number }>;
};

export default function SwiftUIBottomSheetModal({
    visible,
    onClose,
    children,
    fitToContents = false,
    useSwiftUIScrollView = false,
    matchContents = false,
    detents = ['large'],
}: SwiftUIBottomSheetModalProps) {
    if (Platform.OS === 'ios' && SwiftUIHost && SwiftUIBottomSheet && SwiftUIRNHostView && SwiftUIGroup) {
        if (!visible) return null;

        const groupModifiers = [
            !fitToContents && presentationDetentsModifier ? presentationDetentsModifier(detents) : null,
            presentationDragIndicatorModifier ? presentationDragIndicatorModifier('visible') : null,
        ].filter(Boolean);

        const hostedContent = (
            <SwiftUIRNHostView matchContents={fitToContents || matchContents}>
                <View style={styles.rnHostedContent}>{children}</View>
            </SwiftUIRNHostView>
        );

        return (
            <SwiftUIHost style={StyleSheet.absoluteFill}>
                <SwiftUIBottomSheet
                    isPresented={visible}
                    onIsPresentedChange={(isPresented: boolean) => {
                        if (!isPresented) onClose();
                    }}
                    fitToContents={fitToContents}
                >
                    <SwiftUIGroup modifiers={groupModifiers}>
                        {useSwiftUIScrollView && SwiftUIScrollView ? (
                            <SwiftUIScrollView showsIndicators={false}>
                                {hostedContent}
                            </SwiftUIScrollView>
                        ) : hostedContent}
                    </SwiftUIGroup>
                </SwiftUIBottomSheet>
            </SwiftUIHost>
        );
    }

    return (
        <Modal
            transparent
            visible={visible}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.fallbackBackdrop}>
                <View style={styles.fallbackSheet}>{children}</View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    rnHostedContent: {
        flex: 1,
        width: '100%',
    },
    fallbackBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    fallbackSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#111111',
    },
});
