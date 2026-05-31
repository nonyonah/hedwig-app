'use client';

import { useEffect } from 'react';
import { useAssistantSidebar } from '@/components/providers/assistant-sidebar-provider';

export function useAssistantPageContext(page: string, data?: Record<string, unknown>) {
  const { setPageContext } = useAssistantSidebar();

  useEffect(() => {
    setPageContext({ page, route: window.location.pathname, data });
    return () => setPageContext(null);
  }, [page, data, setPageContext]);
}
