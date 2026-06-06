-- 061: Add review/approved/changes_requested statuses to project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
