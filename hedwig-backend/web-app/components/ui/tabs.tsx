'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex rounded-[15px] border border-border/80 bg-white p-1 shadow-soft', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn('rounded-[15px] px-4 py-2 text-sm font-semibold text-muted-foreground transition data-[state=active]:bg-primary data-[state=active]:text-primary-foreground', className)}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
