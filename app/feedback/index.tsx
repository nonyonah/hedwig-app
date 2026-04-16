import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { getPublicWebBaseUrl } from '../../utils/publicWebUrl';

type UserbackIdentity = {
  id: string;
  info: {
    name: string;
    email: string;
  };
};

function resolveIdentity(user: any): UserbackIdentity | null {
  if (!user) return null;

  const email = String(
    user?.email?.address ||
    user?.google?.email ||
    user?.apple?.email ||
    (Array.isArray(user?.linkedAccounts)
      ? user.linkedAccounts.find((account: any) => account?.type === 'email')?.address
      : '') ||
    user?.email ||
    ''
  ).trim();
  if (!email) return null;

  const name = String(
    user?.google?.name ||
    [user?.apple?.firstName, user?.apple?.lastName].filter(Boolean).join(' ') ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    email
  ).trim();
  const id = String(user?.id || email).trim();
  if (!id || !name) return null;

  return {
    id,
    info: {
      name,
      email
    }
  };
}

function buildFeedbackHtml(token: string, identity: UserbackIdentity | null) {
  const payload = JSON.stringify({ token, identity }).replace(/</g, '\\u003c');

  return `<!doctype html>
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
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { margin: 0 0 16px; color: #525866; line-height: 1.45; }
      .status { font-size: 13px; margin-top: 12px; color: #717680; }
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
      <button type="button" id="open-widget">Open Feedback Widget</button>
      <p class="status" id="status-text">Preparing feedback widget…</p>
    </div>
    <script>
      const config = ${payload};
      const statusEl = document.getElementById('status-text');
      const openBtn = document.getElementById('open-widget');
      const setStatus = (text) => {
        if (statusEl) statusEl.textContent = text;
      };
      const openWidget = () => {
        if (window.Userback && typeof window.Userback.open === 'function') {
          try {
            window.Userback.open('general', 'form');
            return true;
          } catch (error) {}
          try {
            window.Userback.open('general');
            return true;
          } catch (error) {}
          try {
            window.Userback.open();
            return true;
          } catch (error) {}
        }
        if (window.Userback && typeof window.Userback.openForm === 'function') {
          try {
            window.Userback.openForm('general', 'form');
            return true;
          } catch (error) {}
          try {
            window.Userback.openForm('general');
            return true;
          } catch (error) {}
          try {
            window.Userback.openForm();
            return true;
          } catch (error) {}
        }
        return false;
      };
      if (openBtn) {
        openBtn.addEventListener('click', function() {
          const opened = openWidget();
          if (!opened) {
            setStatus('Widget ready, but could not open. Please try again.');
          }
        });
      }

      if (!config.token) {
        setStatus('Feedback is unavailable: EXPO_PUBLIC_USERBACK_TOKEN is not configured.');
      } else {
        window.Userback = window.Userback || {};
        window.Userback.access_token = config.token;
        if (config.identity) {
          window.Userback.user_data = config.identity;
        }

        (function(d) {
          var s = d.createElement('script');
          s.async = true;
          s.src = 'https://static.userback.io/widget/v1.js';
          s.onload = function() {
            setStatus('Ready');
            const opened = openWidget();
            if (!opened) {
              setStatus('Widget loaded. Tap "Open Feedback Widget" to continue.');
            }
          };
          s.onerror = function() {
            setStatus('Could not load feedback widget. Please try again.');
          };
          (d.head || d.body).appendChild(s);
        })(document);
      }
    </script>
  </body>
</html>`;
}

export default function FeedbackScreen() {
  const router = useRouter();
  const themeColors = useThemeColors();
  const { user } = useAuth();
  const token = (process.env.EXPO_PUBLIC_USERBACK_TOKEN || '').trim();
  const identity = useMemo(() => resolveIdentity(user), [user]);
  const [useHostedPage, setUseHostedPage] = useState(true);
  const hostedFeedbackUrl = useMemo(() => {
    try {
      const baseUrl = getPublicWebBaseUrl(
        process.env.EXPO_PUBLIC_WEB_CLIENT_URL || process.env.EXPO_PUBLIC_API_URL || ''
      );
      const url = new URL('/feedback-widget', `${baseUrl}/`);
      if (identity) {
        url.searchParams.set('id', identity.id);
        url.searchParams.set('name', identity.info.name);
        url.searchParams.set('email', identity.info.email);
      }
      return url.toString();
    } catch {
      return '';
    }
  }, [identity]);
  const html = useMemo(() => buildFeedbackHtml(token, identity), [identity, token]);
  const feedbackSource = useMemo(() => {
    if (useHostedPage && hostedFeedbackUrl) {
      return { uri: hostedFeedbackUrl };
    }
    return { html };
  }, [hostedFeedbackUrl, html, useHostedPage]);

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
        source={feedbackSource}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        javaScriptCanOpenWindowsAutomatically
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        onError={() => {
          if (useHostedPage) {
            setUseHostedPage(false);
          }
        }}
        onHttpError={() => {
          if (useHostedPage) {
            setUseHostedPage(false);
          }
        }}
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
