export interface TimeEntry {
  id: string;
  projectId: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  hourlyRate: number | null;
  billableAmount: number | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
  assignedTo: string | null;
  project?: { id: string; name: string; client?: { id: string; name: string } };
}

export interface TimeSummary {
  hoursToday: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
  billableAmount: number;
  topClient: { id: string; name: string; hours: number } | null;
  topProject: { id: string; name: string; hours: number } | null;
}
