'use client';

import { useEffect, useState } from 'react';
import { X } from '@/components/ui/lucide-icons';

const STORAGE_KEY = 'hedwig-app-nudge-dismissed';

function TestFlightBadge() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="135" height="40" viewBox="0 0 135 40" aria-label="Download on TestFlight">
      <rect width="135" height="40" rx="8" fill="#000" />
      <text x="42" y="13" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="9" fill="#fff" letterSpacing="0.3">Download on</text>
      <text x="42" y="28" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="16" fontWeight="600" fill="#fff">TestFlight</text>
      {/* Apple logo */}
      <path d="M18 10.5c1.9-.1 3.5 1 4.4 1 .9 0 2.6-1.1 4.4-.9.7 0 2.8.3 4.1 2.2-.1.1-2.5 1.4-2.4 4.3 0 3.4 3 4.5 3 4.6-.1.1-.5 1.7-1.6 3.3-.9 1.4-1.9 2.8-3.4 2.8-1.5.1-1.9-.9-3.7-.9-1.7 0-2.3.9-3.7.9-1.5.1-2.6-1.4-3.6-2.8-1.2-1.8-2.2-4.6-2.2-7.3 0-4.3 2.8-6.5 5.5-6.5.8 0 2.2.1 3.2 1zm3.2-3.5c.8-1 2.1-1.7 3.2-1.8.1 1.3-.4 2.6-1.1 3.5-.8 1-2 1.8-3.2 1.7-.2-1.3.3-2.6 1.1-3.4z" fill="#fff" />
    </svg>
  );
}

function PlayStoreBadge() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="135" height="40" viewBox="0 0 135 40" aria-label="Get it on Google Play">
      <rect width="135" height="40" rx="8" fill="#000" />
      <text x="42" y="13" fontFamily="Arial, sans-serif" fontSize="9" fill="#fff" letterSpacing="0.3">GET IT ON</text>
      <text x="42" y="28" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="600" fill="#fff">Google Play</text>
      {/* Play Store triangle icon */}
      <path d="M13 8.5l14 11.5-14 11.5V8.5z" fill="url(#ps-grad)" />
      <defs>
        <linearGradient id="ps-grad" x1="13" y1="8.5" x2="27" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d2ff" />
          <stop offset="100%" stopColor="#3a7bd5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AppDownloadNudge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e9eaeb] bg-[#181d27] px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.3.07 2.19.73 2.98.76 1.14-.23 2.23-.9 3.43-.77 1.47.17 2.56.82 3.28 2.05-2.96 1.78-2.26 5.7.37 6.82-.54 1.43-1.25 2.83-2.06 4.02zM12 7.24c-.13-2.52 2.02-4.6 4.5-4.74.33 2.83-2.58 4.96-4.5 4.74z" />
          </svg>
        </div>
        <p className="text-[13px] font-medium text-white">
          Hedwig is better on mobile —{' '}
          <span className="text-[#93c5fd]">get the app for full access</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href="https://testflight.apple.com/join/aKXnyjP4n"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
        >
          <TestFlightBadge />
        </a>
        <a
          href="https://play.google.com/store/apps/details?id=com.hedwig.app"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
        >
          <PlayStoreBadge />
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
