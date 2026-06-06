'use client';

import { useEffect, useRef } from 'react';
import { useAssistantSidebar } from '@/components/providers/assistant-sidebar-provider';

export function useAssistantPageContext(page: string, data?: Record<string, unknown>) {
  const { setPageContext } = useAssistantSidebar();
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    setPageContext({ page, route: window.location.pathname, data: dataRef.current });
    return () => setPageContext(null);
  }, [page, setPageContext]);
}
