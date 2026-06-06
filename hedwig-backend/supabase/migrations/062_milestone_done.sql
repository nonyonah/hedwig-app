-- 062: Add 'done' to milestone_status enum
ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'done';
