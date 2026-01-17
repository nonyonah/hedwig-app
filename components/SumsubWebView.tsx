import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '../theme/colors';

interface SumsubWebViewProps {
    accessToken: string;
    onComplete: (status: 'approved' | 'pending' | 'rejected') => void;
    onError: (error: string) => void;
    onTokenRefresh: () => Promise<string | null>;
}

/**
 * Sumsub WebView component for Android
 * Uses Sumsub's WebSDK embedded in a WebView
 */
export const SumsubWebView: React.FC<SumsubWebViewProps> = ({
    accessToken,
    onComplete,
    onError,
    onTokenRefresh
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const webViewRef = useRef<WebView>(null);

    // HTML page that loads and initializes Sumsub WebSDK
    const getWebSDKHtml = (token: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Identity Verification</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            width: 100%; 
            height: 100%; 
            background: #FFFFFF;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        #sumsub-websdk-container {
            width: 100%;
            height: 100%;
            position: absolute;
            top: 0;
            left: 0;
        }
        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
        }
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #2563EB;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="sumsub-websdk-container">
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>Loading verification...</p>
        </div>
    </div>
    
    <script src="https://static.sumsub.com/idensic/static/sns-websdk-builder.js"></script>
    <script>
        function sendMessage(type, data) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
        }

        function launchSumsub(accessToken) {
            try {
                const snsWebSdkInstance = snsWebSdk
                    .init(accessToken, function(newAccessTokenCallback) {
                        // Request new token from React Native
                        sendMessage('tokenRefreshRequest', {});
                        // Store callback for later use
                        window.tokenRefreshCallback = newAccessTokenCallback;
                    })
                    .withConf({
                        lang: 'en',
                        theme: 'light'
                    })
                    .withOptions({ addViewportTag: false, adaptIframeHeight: true })
                    .on('idCheck.onStepCompleted', (payload) => {
                        sendMessage('stepCompleted', payload);
                    })
                    .on('idCheck.onError', (error) => {
                        sendMessage('error', { message: error.message || 'Unknown error' });
                    })
                    .on('idCheck.applicantStatus', (payload) => {
                        sendMessage('applicantStatus', payload);
                        if (payload.reviewResult) {
                            if (payload.reviewResult.reviewAnswer === 'GREEN') {
                                sendMessage('complete', { status: 'approved' });
                            } else if (payload.reviewResult.reviewAnswer === 'RED') {
                                sendMessage('complete', { status: 'rejected' });
                            }
                        }
                    })
                    .on('idCheck.moduleResultPresented', (data) => {
                        sendMessage('moduleResultPresented', data);
                    })
                    .on('idCheck.onActionSubmitted', (data) => {
                        sendMessage('actionSubmitted', data);
                    })
                    .build();

                snsWebSdkInstance.launch('#sumsub-websdk-container');
                sendMessage('sdkReady', {});
            } catch (e) {
                sendMessage('error', { message: e.message || 'Failed to initialize SDK' });
            }
        }

        // Initialize with provided token
        launchSumsub('${token}');
    </script>
</body>
</html>
`;

    const handleMessage = async (event: WebViewMessageEvent) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            console.log('[SumsubWebView] Message:', message);

            switch (message.type) {
                case 'sdkReady':
                    setIsLoading(false);
                    break;
                case 'complete':
                    onComplete(message.data.status);
                    break;
                case 'error':
                    onError(message.data.message);
                    break;
                case 'tokenRefreshRequest':
                    const newToken = await onTokenRefresh();
                    if (newToken && webViewRef.current) {
                        webViewRef.current.injectJavaScript(`
                            if (window.tokenRefreshCallback) {
                                window.tokenRefreshCallback('${newToken}');
                            }
                        `);
                    }
                    break;
                case 'applicantStatus':
                    // If status indicates completion
                    if (message.data?.reviewStatus === 'completed') {
                        const result = message.data?.reviewResult?.reviewAnswer;
                        if (result === 'GREEN') {
                            onComplete('approved');
                        } else if (result === 'RED') {
                            onComplete('rejected');
                        } else {
                            onComplete('pending');
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error('[SumsubWebView] Failed to parse message:', e);
        }
    };

    return (
        <View style={styles.container}>
            <WebView
                ref={webViewRef}
                source={{ html: getWebSDKHtml(accessToken) }}
                style={styles.webview}
                onMessage={handleMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback={true}
                originWhitelist={['*']}
                mixedContentMode="compatibility"
                onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('[SumsubWebView] WebView error:', nativeEvent);
                    onError('Failed to load verification page');
                }}
            />
            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Preparing verification...</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    webview: {
        flex: 1,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#666666',
    },
});

export default SumsubWebView;
