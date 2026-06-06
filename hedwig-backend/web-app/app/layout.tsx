import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
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
  const loadRemoteFonts = process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_DISABLE_REMOTE_FONTS !== 'true';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {loadRemoteFonts ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
              rel="stylesheet"
              href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,300..700&display=swap"
            />
          </>
        ) : null}
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute={['class', 'data-theme']}
          defaultTheme="system"
          enableSystem
          enableColorScheme
          storageKey="hedwig-theme"
          disableTransitionOnChange
        >
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
        </ThemeProvider>
      </body>
    </html>
  );
}
