'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getUserback } from '@userback/widget';

type UserbackIdentity = {
  id: string;
  info: {
    name: string;
    email: string;
  };
};

function readIdentity(searchParams: URLSearchParams): UserbackIdentity | null {
  const id = String(searchParams.get('id') || '').trim();
  const email = String(searchParams.get('email') || '').trim();
  const name = String(searchParams.get('name') || '').trim();

  if (!id || !email || !name) return null;
  return {
    id,
    info: {
      name,
      email
    }
  };
}

export default function FeedbackWidgetPage() {
  const searchParams = useSearchParams();
  const token = (process.env.NEXT_PUBLIC_USERBACK_TOKEN || '').trim();
  const identity = useMemo(() => readIdentity(searchParams), [searchParams]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Preparing feedback widget...');

  const openWidget = useCallback(() => {
    const widget = getUserback();
    if (!widget) {
      setStatus('Feedback widget is still loading. Please wait and try again.');
      return false;
    }

    if (identity) {
      try {
        widget.identify(identity.id, identity.info);
      } catch {}
    }

    try {
      widget.openForm('general', 'form');
      setStatus('Opening feedback form...');
      return true;
    } catch {}

    try {
      widget.open();
      setStatus('Opening feedback form...');
      return true;
    } catch {}

    setStatus('Widget loaded, but opening failed. Tap again.');
    return false;
  }, [identity]);

  useEffect(() => {
    if (!token) {
      setStatus('Feedback is unavailable right now.');
      setReady(false);
      return;
    }

    let mounted = true;
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (!mounted) return;
      const widget = getUserback();
      if (widget) {
        setReady(true);
        setStatus('Ready');
        window.clearInterval(timer);
        return;
      }
      if (Date.now() - start > 12000) {
        setStatus('Still loading feedback widget. Tap the button to retry.');
        window.clearInterval(timer);
      }
    }, 300);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    openWidget();
  }, [openWidget, ready]);

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-[#f8fafc] p-6 text-[#181d27]">
      <section className="mt-8 rounded-2xl border border-[#e9eaeb] bg-white p-6 shadow-xs">
        <h1 className="text-xl font-semibold">Send feedback</h1>
        <p className="mt-2 text-sm leading-6 text-[#717680]">
          The feedback widget should open automatically. If it does not, use the button below.
        </p>
        <button
          type="button"
          onClick={openWidget}
          className="mt-5 inline-flex rounded-full bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
        >
          Open feedback widget
        </button>
        <p className="mt-3 text-xs text-[#717680]">{status}</p>
      </section>
    </main>
  );
}
