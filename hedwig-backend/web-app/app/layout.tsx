import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { HedwigPrivyProvider } from '@/components/providers/privy-provider';
import { AuthGate } from '@/components/providers/auth-gate';
import { CurrencyProvider } from '@/components/providers/currency-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { HedwigPostHogProvider } from '@/components/providers/posthog-provider';

export const metadata: Metadata = {
  title: 'Hedwig',
  description: 'Freelancer operating system for projects, payments, deadlines, and wallet activity.',
  icons: {
    icon: '/hedwig-icon.png',
    shortcut: '/hedwig-icon.png',
    apple: '/hedwig-icon.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="userback-config" strategy="afterInteractive">
          {`
            window.Userback = window.Userback || {};
            window.Userback.access_token = 'A-znhIWLtmunJ13CTaerlWgH5Zw';
            window.Userback.user_data = {
              id: '123456',
              info: {
                name: 'someone',
                email: 'someone@example.com'
              }
            };
          `}
        </Script>
        <Script
          id="userback-widget"
          src="https://static.userback.io/widget/v1.js"
          strategy="afterInteractive"
        />
        <HedwigPrivyProvider>
          <HedwigPostHogProvider>
            <CurrencyProvider>
              <ToastProvider>
                <AuthGate>{children}</AuthGate>
              </ToastProvider>
            </CurrencyProvider>
          </HedwigPostHogProvider>
        </HedwigPrivyProvider>
      </body>
    </html>
  );
}
