import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/colors';
import IOSGlassIconButton from './ui/IOSGlassIconButton';
import { X } from './ui/AppIcon';

interface OCRScannerProps {
    onTextDetected: (text: string) => void;
    onClose: () => void;
    getAccessToken: () => Promise<string | null>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;
const STABILITY_CHECK_INTERVAL_MS = 600;
const STABLE_FRAMES_NEEDED = 2;
const STABILITY_VARIANCE_THRESHOLD = 0.08; // 8% variance allowed
const MAX_STABILITY_WAIT_MS = 8000; // fallback capture after 8s

/**
 * OCR Scanner component using expo-camera + Gemini Vision backend.
 * Auto-captures only when the camera is held steady over text.
 * Uses frame stability detection (comparing consecutive low-res snapshots)
 * to determine when the user has positioned the camera correctly.
 */
export default function OCRScanner({ onTextDetected, onClose, getAccessToken }: OCRScannerProps) {
    const themeColors = useThemeColors();
    const [permission, requestPermission] = useCameraPermissions();
    const [isScanning, setIsScanning] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [phase, setPhase] = useState<'positioning' | 'stabilizing' | 'scanning'>('positioning');
    const cameraRef = useRef<CameraView>(null);
    const isActiveRef = useRef(true);
    const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stableFrameCountRef = useRef(0);
    const lastFrameSizeRef = useRef(0);

    // Cleanup on unmount
    useEffect(() => {
        isActiveRef.current = true;
        return () => {
            isActiveRef.current = false;
            if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
            if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
        };
    }, []);

    const doFullCapture = useCallback(async () => {
        if (!cameraRef.current || !isActiveRef.current) return;
        setPhase('scanning');
        setIsScanning(true);

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: true,
            });

            if (!photo?.base64) {
                if (!isActiveRef.current) return;
                handleRetry('Could not capture image.');
                return;
            }

            const base64Data = photo.base64;
            const mimeType = 'image/jpeg';
            const dataUri = `data:${mimeType};base64,${base64Data}`;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const token = await getAccessToken();
            if (!token) {
                if (!isActiveRef.current) return;
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

            if (!isActiveRef.current) return;
            const data = await response.json();

            if (response.ok && data.success && data.data?.rawText && data.data.rawText.trim().length > 0) {
                onTextDetected(data.data.rawText);
            } else {
                const errorMsg = data.error || 'No text detected in the image.';
                handleRetry(errorMsg);
            }
        } catch (error) {
            console.error('OCR scan error:', error);
            if (!isActiveRef.current) return;
            handleRetry('Could not process the image.');
        }
    }, [getAccessToken, onTextDetected]);

    const handleRetry = useCallback((reason: string) => {
        setRetryCount((prev) => {
            const next = prev + 1;
            if (next >= MAX_RETRIES) {
                setIsScanning(false);
                setPhase('positioning');
                Alert.alert(
                    'Scan Failed',
                    `${reason}\n\nPlease ensure payment details are clearly visible and try again.`,
                    [
                        {
                            text: 'Try Again',
                            onPress: () => {
                                setRetryCount(0);
                                setPhase('positioning');
                                startStabilityCheck();
                            },
                        },
                        {
                            text: 'Cancel',
                            style: 'cancel',
                            onPress: () => {
                                setIsScanning(false);
                                setPhase('positioning');
                                onClose();
                            },
                        },
                    ]
                );
                return next;
            }
            // Auto-retry after delay
            if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
            stabilityTimerRef.current = setTimeout(() => {
                if (isActiveRef.current) {
                    doFullCapture();
                }
            }, RETRY_DELAY_MS);
            return next;
        });
    }, [doFullCapture, onClose]);

    const startStabilityCheck = useCallback(() => {
        if (!cameraRef.current || !isActiveRef.current) return;

        stableFrameCountRef.current = 0;
        lastFrameSizeRef.current = 0;
        setPhase('stabilizing');

        // Fallback: capture anyway after max wait time
        if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = setTimeout(() => {
            if (isActiveRef.current && phase !== 'scanning') {
                doFullCapture();
            }
        }, MAX_STABILITY_WAIT_MS);

        const checkFrame = async () => {
            if (!cameraRef.current || !isActiveRef.current) return;

            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.05, // very low quality for speed
                    base64: true,
                });

                if (!photo?.base64) {
                    scheduleNext();
                    return;
                }

                const currentSize = photo.base64.length;

                if (lastFrameSizeRef.current > 0) {
                    const diff = Math.abs(currentSize - lastFrameSizeRef.current);
                    const variance = diff / lastFrameSizeRef.current;

                    if (variance < STABILITY_VARIANCE_THRESHOLD) {
                        stableFrameCountRef.current += 1;
                        if (stableFrameCountRef.current >= STABLE_FRAMES_NEEDED) {
                            // Camera is stable — do full capture
                            if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
                            doFullCapture();
                            return;
                        }
                    } else {
                        stableFrameCountRef.current = 0;
                    }
                }

                lastFrameSizeRef.current = currentSize;
                scheduleNext();
            } catch {
                scheduleNext();
            }
        };

        const scheduleNext = () => {
            if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
            stabilityTimerRef.current = setTimeout(checkFrame, STABILITY_CHECK_INTERVAL_MS);
        };

        // Start checking
        scheduleNext();
    }, [doFullCapture, phase]);

    const onCameraReady = useCallback(() => {
        // Small delay to let the camera fully initialize before stability checks
        setTimeout(() => {
            if (isActiveRef.current) {
                startStabilityCheck();
            }
        }, 300);
    }, [startStabilityCheck]);

    const getOverlayText = () => {
        if (phase === 'positioning') {
            return 'Point camera at payment details';
        }
        if (phase === 'stabilizing') {
            return 'Hold steady…';
        }
        if (isScanning) {
            return retryCount > 0
                ? `Scanning… (retry ${retryCount}/${MAX_RETRIES})`
                : 'Scanning…';
        }
        return 'Point camera at payment details';
    };

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
                    onCameraReady={onCameraReady}
                >
                    <View style={styles.overlay}>
                        <View style={styles.scanFrame}>
                            <View style={[styles.scanCorner, styles.topLeft]} />
                            <View style={[styles.scanCorner, styles.topRight]} />
                            <View style={[styles.scanCorner, styles.bottomLeft]} />
                            <View style={[styles.scanCorner, styles.bottomRight]} />
                        </View>
                        <View style={styles.instructionsContainer}>
                            {phase === 'scanning' ? (
                                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginBottom: 8 }} />
                            ) : null}
                            <Text style={styles.scanInstructions}>
                                {getOverlayText()}
                            </Text>
                        </View>
                    </View>
                </CameraView>
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
    instructionsContainer: {
        marginTop: 20,
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    scanInstructions: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
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
