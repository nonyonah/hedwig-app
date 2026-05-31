'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface PageContext {
  page: string;
  route: string;
  data?: Record<string, unknown>;
}

interface AssistantSidebarContextValue {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
  width: number;
}

const AssistantSidebarContext = createContext<AssistantSidebarContextValue | null>(null);

const STORAGE_KEY = 'hedwig-assistant-sidebar-open';

export function AssistantSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    }
  }, []);

  const toggle = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      }
      return next;
    });
  }, []);

  return (
    <AssistantSidebarContext.Provider
      value={{ open, toggle, setOpen, pageContext, setPageContext, width: 380 }}
    >
      {children}
    </AssistantSidebarContext.Provider>
  );
}

export function useAssistantSidebar() {
  const ctx = useContext(AssistantSidebarContext);
  if (!ctx) {
    throw new Error('useAssistantSidebar must be used within AssistantSidebarProvider');
  }
  return ctx;
}
