'use client';

import * as React from 'react';
import { Tabs as HeroUITabs } from '@heroui/react';
import { cn } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Hedwig Tabs — powered by HeroUI
   Keeps the same Tabs / TabsList / TabsTrigger / TabsContent API.
   -------------------------------------------------------------------------- */

export function Tabs({ children, defaultValue, value, onValueChange, className, ...props }: {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const activeValue = isControlled ? value : internalValue;

  const handleChange = (key: React.Key) => {
    const str = String(key);
    if (!isControlled) setInternalValue(str);
    onValueChange?.(str);
  };

  return (
    <HeroUITabs
      selectedKey={activeValue}
      onSelectionChange={handleChange}
      className={cn('w-full', className)}
      {...props}
    >
      {children}
    </HeroUITabs>
  );
}

export function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <HeroUITabs.ListContainer className={cn('w-full', className)} {...props}>
      <HeroUITabs.List
        aria-label="Tabs"
        className={cn(
          'inline-flex rounded-[15px] border border-[var(--color-border)]/80 bg-[var(--color-surface)] p-1 shadow-soft'
        )}
      >
        {children}
      </HeroUITabs.List>
    </HeroUITabs.ListContainer>
  );
}

export function TabsTrigger({ value, children, className, disabled }: {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <HeroUITabs.Tab
      id={value}
      isDisabled={disabled}
      className={cn(
        'rounded-[15px] px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] transition',
        'data-[selected=true]:bg-[var(--color-accent)] data-[selected=true]:text-white',
        className
      )}
    >
      {children}
      <HeroUITabs.Indicator />
    </HeroUITabs.Tab>
  );
}

export function TabsContent({ value, children, className, ...props }: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <HeroUITabs.Panel id={value} className={cn('pt-4', className)} {...props}>
      {children}
    </HeroUITabs.Panel>
  );
}
