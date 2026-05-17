import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { HedwigPrivyProvider } from '@/components/providers/privy-provider';
import { AuthGate } from '@/components/providers/auth-gate';
import { CurrencyProvider } from '@/components/providers/currency-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { HedwigPostHogProvider } from '@/components/providers/posthog-provider';
import { UserbackProvider } from '@/components/providers/userback-provider';

export const metadata: Metadata = {
  title: 'Hedwig',
  description: 'Freelancer operating system for projects, payments, deadlines, and subscription workflows.',
  icons: {
    icon: '/hedwig-icon.png',
    shortcut: '/hedwig-icon.png',
    apple: '/hedwig-icon.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('settings_theme') || localStorage.getItem('hedwig-web-theme') || 'system';
                  var resolved = stored === 'dark' || stored === 'light'
                    ? stored
                    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  document.documentElement.dataset.theme = resolved;
                  document.documentElement.style.colorScheme = resolved;
                } catch (_) {
                  document.documentElement.dataset.theme = 'light';
                  document.documentElement.style.colorScheme = 'light';
                }
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,300..700&display=swap"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <HedwigPrivyProvider>
          <HedwigPostHogProvider>
            <Suspense fallback={null}>
              <UserbackProvider />
            </Suspense>
            <CurrencyProvider>
              <ToastProvider>
                <AuthGate>{children}</AuthGate>
              </ToastProvider>
            </CurrencyProvider>
            <Analytics />
          </HedwigPostHogProvider>
        </HedwigPrivyProvider>
      </body>
    </html>
  );
}
