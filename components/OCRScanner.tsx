import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import IOSGlassIconButton from './ui/IOSGlassIconButton';
import { X } from './ui/AppIcon';

interface OCRScannerProps {
    onTextDetected: (text: string) => void;
    onClose: () => void;
    getAccessToken: () => Promise<string | null>;
}

const MAX_RETRIES = 3;

/**
 * OCR Scanner component using expo-camera + AI Vision backend.
 * Manual capture only — user taps the shutter button to take a photo.
 */
export default function OCRScanner({ onTextDetected, onClose, getAccessToken }: OCRScannerProps) {
    const themeColors = useThemeColors();
    const { cameraSoundEnabled } = useSettings();
    const [permission, requestPermission] = useCameraPermissions();
    const [isScanning, setIsScanning] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const cameraRef = useRef<CameraView>(null);

    const doFullCapture = useCallback(async () => {
        if (!cameraRef.current) return;
        setIsScanning(true);

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: true,
                mute: !cameraSoundEnabled,
            });

            if (!photo?.base64) {
                handleRetry('Could not capture image.');
                return;
            }

            const base64Data = photo.base64;
            const mimeType = 'image/jpeg';
            const dataUri = `data:${mimeType};base64,${base64Data}`;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const token = await getAccessToken();
            if (!token) {
                Alert.alert('Not Authenticated', 'Please sign in to use the scanner.');
                setIsScanning(false);
                return;
            }

            const formData = new FormData();
            formData.append('file', {
                uri: dataUri,
                type: mimeType,
                name: 'scan.jpg',
            } as any);

            const response = await fetch(`${apiUrl}/api/integrations/extract-payment-details`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await response.json();

            if (response.ok && data.success && data.data?.rawText && data.data.rawText.trim().length > 0) {
                onTextDetected(data.data.rawText);
            } else {
                const errorMsg = data.error || 'No text detected in the image.';
                handleRetry(errorMsg);
            }
        } catch (error) {
            console.error('OCR scan error:', error);
            handleRetry('Could not process the image.');
        }
    }, [getAccessToken, onTextDetected]);

    const handleRetry = useCallback((reason: string) => {
        setRetryCount((prev) => {
            const next = prev + 1;
            if (next >= MAX_RETRIES) {
                setIsScanning(false);
                Alert.alert(
                    'Scan Failed',
                    `${reason}\n\nPlease ensure payment details are clearly visible and try again.`,
                    [
                        {
                            text: 'Try Again',
                            onPress: () => {
                                setRetryCount(0);
                                setIsScanning(false);
                            },
                        },
                        {
                            text: 'Cancel',
                            style: 'cancel',
                            onPress: () => {
                                setIsScanning(false);
                                onClose();
                            },
                        },
                    ]
                );
                return next;
            }
            setIsScanning(false);
            return next;
        });
    }, [onClose]);

    if (!permission?.granted) {
        return (
            <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: themeColors.background }]}>
                <View style={styles.permissionContainer}>
                    <Text style={[styles.permissionText, { color: themeColors.textPrimary }]}>
                        Camera permission is required to scan payment details.
                    </Text>
                    <View
                        style={[styles.permissionButton, { backgroundColor: themeColors.primary }]}
                        accessible={true}
                        accessibilityRole="button"
                    >
                        <Text style={styles.permissionButtonText} onPress={requestPermission}>Grant Permission</Text>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: '#000' }]}>
            {/* Header */}
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={onClose}
                    systemImage="xmark"
                    containerStyle={styles.closeButton}
                    circleStyle={[styles.closeButtonCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                    icon={<X size={20} color="#FFFFFF" strokeWidth={3} />}
                />
                <Text style={styles.headerTitle}>Scan Payment Details</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Camera View */}
            <View style={styles.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="back"
                    ratio="16:9"
                    mute={!cameraSoundEnabled}
                >
                    <View style={styles.overlay}>
                        <View style={styles.scanFrame}>
                            <View style={[styles.scanCorner, styles.topLeft]} />
                            <View style={[styles.scanCorner, styles.topRight]} />
                            <View style={[styles.scanCorner, styles.bottomLeft]} />
                            <View style={[styles.scanCorner, styles.bottomRight]} />
                        </View>
                        {isScanning ? (
                            <View style={styles.scanningOverlay}>
                                <ActivityIndicator size="large" color="#FFFFFF" />
                                <Text style={styles.scanningText}>
                                    {retryCount > 0 ? `Scanning… (retry ${retryCount}/${MAX_RETRIES})` : 'Scanning…'}
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.scanInstructions}>
                                Point camera at payment details
                            </Text>
                        )}
                    </View>
                </CameraView>
            </View>

            {/* Bottom Controls */}
            <View style={styles.bottomControls}>
                {isScanning ? (
                    <View style={styles.scanningContainer}>
                        <ActivityIndicator size="large" color="#FFFFFF" />
                        <Text style={styles.scanningText}>Reading text...</Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.captureButton}
                        onPress={doFullCapture}
                        activeOpacity={0.8}
                    >
                        <View style={styles.captureButtonInner} />
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        zIndex: 10,
    },
    closeButton: {
        width: 40,
        height: 40,
    },
    closeButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 40,
    },
    cameraContainer: {
        flex: 1,
        overflow: 'hidden',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanFrame: {
        width: 280,
        height: 180,
        position: 'relative',
    },
    scanCorner: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderColor: '#FFFFFF',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 3,
        borderLeftWidth: 3,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 3,
        borderRightWidth: 3,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 3,
        borderLeftWidth: 3,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 3,
        borderRightWidth: 3,
    },
    scanInstructions: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 20,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    scanningOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    scanningText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
    },
    bottomControls: {
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 20,
    },
    captureButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#FFFFFF',
    },
    captureButtonInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFFFFF',
    },
    scanningContainer: {
        alignItems: 'center',
        gap: 12,
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        gap: 16,
    },
    permissionText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        textAlign: 'center',
    },
    permissionButton: {
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
    },
    permissionButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
