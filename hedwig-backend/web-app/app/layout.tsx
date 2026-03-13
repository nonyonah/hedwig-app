import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { HedwigPrivyProvider } from '@/components/providers/privy-provider';
import { AuthGate } from '@/components/providers/auth-gate';
import { cn } from '@/lib/utils';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans'
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500']
});

export const metadata: Metadata = {
  title: 'Hedwig Web',
  description: 'Freelancer operating system for work, payments, deadlines, wallet activity, and AI-assisted billing.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(sans.variable, mono.variable, 'font-sans antialiased')}>
        <HedwigPrivyProvider>
          <AuthGate>{children}</AuthGate>
        </HedwigPrivyProvider>
      </body>
    </html>
  );
}
