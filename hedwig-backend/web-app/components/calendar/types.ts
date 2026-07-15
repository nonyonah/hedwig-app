import type { TimeEntry } from '@/components/time/types';

export type FilterValue = 'all' | 'reminder' | 'milestone' | 'invoice' | 'project' | 'time_entry';

export type PlannerItem = {
  id: string;
  kind: 'reminder' | 'milestone' | 'invoice' | 'project' | 'time_entry';
  title: string;
  subtitle: string;
  meta: string;
  date: string;
  href?: string;
  timeEntry?: TimeEntry;
};
