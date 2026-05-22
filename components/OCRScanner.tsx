import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
    Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/colors';
import IOSGlassIconButton from './ui/IOSGlassIconButton';
import { X, ScanLine } from './ui/AppIcon';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OCRScannerProps {
    onTextDetected: (text: string) => void;
    onClose: () => void;
}

/**
 * OCR Scanner component using expo-camera.
 * On iOS uses native SwiftUI glass buttons via IOSGlassIconButton.
 */
export default function OCRScanner({ onTextDetected, onClose }: OCRScannerProps) {
    const themeColors = useThemeColors();
    const [permission, requestPermission] = useCameraPermissions();
    const [isScanning, setIsScanning] = useState(false);
    const [capturedText, setCapturedText] = useState('');
    const cameraRef = useRef<CameraView>(null);

    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
        }
    }, [permission]);

    const handleCapture = async () => {
        if (!cameraRef.current) return;
        setIsScanning(true);
        try {
            // Take a photo
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: true,
            });

            if (photo?.base64) {
                // In a real implementation, you'd send this to an OCR service
                // For now, we'll simulate with a mock delay
                setTimeout(() => {
                    // This is where you'd integrate with Google Vision, ML Kit, or similar
                    // For demo purposes, we'll pass the captured text through
                    onTextDetected(capturedText || 'Sample detected text from OCR');
                    setIsScanning(false);
                }, 1500);
            }
        } catch (error) {
            console.error('Camera capture error:', error);
            Alert.alert('Capture Failed', 'Could not capture image. Please try again.');
            setIsScanning(false);
        }
    };

    if (!permission?.granted) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                <View style={styles.permissionContainer}>
                    <Text style={[styles.permissionText, { color: themeColors.textPrimary }]}>
                        Camera permission is required to scan payment details.
                    </Text>
                    <TouchableOpacity
                        style={[styles.permissionButton, { backgroundColor: themeColors.primary }]}
                        onPress={requestPermission}
                    >
                        <Text style={styles.permissionButtonText}>Grant Permission</Text>
                    </TouchableOpacity>
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
                >
                    {/* Scan overlay */}
                    <View style={styles.overlay}>
                        <View style={styles.scanFrame}>
                            <View style={[styles.scanCorner, styles.topLeft]} />
                            <View style={[styles.scanCorner, styles.topRight]} />
                            <View style={[styles.scanCorner, styles.bottomLeft]} />
                            <View style={[styles.scanCorner, styles.bottomRight]} />
                        </View>
                        <Text style={styles.scanInstructions}>
                            Position payment details within the frame
                        </Text>
                    </View>
                </CameraView>
            </View>

            {/* Bottom Controls */}
            <View style={styles.bottomControls}>
                {isScanning ? (
                    <ActivityIndicator size="large" color="#FFFFFF" />
                ) : (
                    <TouchableOpacity
                        style={styles.captureButton}
                        onPress={handleCapture}
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
        width: SCREEN_WIDTH * 0.75,
        height: SCREEN_WIDTH * 0.5,
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
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    permissionText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
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
