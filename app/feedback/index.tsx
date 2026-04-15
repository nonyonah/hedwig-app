import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useThemeColors } from '../../theme/colors';

const USERBACK_WIDGET_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
    <title>Hedwig Feedback</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f8fafc;
        color: #181d27;
      }
      .card {
        max-width: 460px;
        margin: 40px auto;
        background: #ffffff;
        border: 1px solid #e9eaeb;
        border-radius: 16px;
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      p {
        margin: 0 0 16px;
        color: #525866;
        line-height: 1.45;
      }
      button {
        border: none;
        border-radius: 999px;
        background: #2563eb;
        color: #ffffff;
        padding: 12px 18px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Send Feedback</h1>
      <p>The feedback widget should open automatically. If it does not, tap the button below.</p>
      <button type="button" onclick="window.Userback && typeof window.Userback.open === 'function' && window.Userback.open();">Open Feedback Widget</button>
    </div>
    <script>
      window.Userback = window.Userback || {};
      window.Userback.access_token = 'A-znhIWLtmunJ13CTaerlWgH5Zw';
      window.Userback.user_data = {
        id: '123456',
        info: {
          name: 'someone',
          email: 'someone@example.com'
        }
      };
      (function(d) {
        var s = d.createElement('script');
        s.async = true;
        s.src = 'https://static.userback.io/widget/v1.js';
        s.onload = function() {
          if (window.Userback && typeof window.Userback.open === 'function') {
            window.Userback.open();
          }
        };
        (d.head || d.body).appendChild(s);
      })(document);
    </script>
  </body>
</html>`;

export default function FeedbackScreen() {
  const router = useRouter();
  const themeColors = useThemeColors();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
          <Text style={[styles.backLabel, { color: themeColors.textPrimary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Feedback</Text>
        <View style={styles.headerSpacer} />
      </View>

      <WebView
        originWhitelist={['*']}
        source={{ html: USERBACK_WIDGET_HTML }}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={themeColors.textSecondary} size="small" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    minWidth: 56,
    paddingVertical: 8,
  },
  backLabel: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14,
  },
  title: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 16,
  },
  headerSpacer: {
    width: 56,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
