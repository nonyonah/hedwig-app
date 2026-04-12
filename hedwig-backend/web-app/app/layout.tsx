import type { Metadata } from 'next';
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
