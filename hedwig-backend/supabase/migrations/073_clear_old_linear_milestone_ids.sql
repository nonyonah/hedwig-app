-- Clear old linear_milestone_id values set during project milestone phase.
-- The feature was switched from LINEAR_CREATE_PROJECT_MILESTONE to
-- LINEAR_CREATE_LINEAR_ISSUE, so existing linked IDs point to project
-- milestones instead of issues. Clearing them lets the next sync create
-- proper Linear issues for each milestone.
UPDATE milestones SET linear_milestone_id = NULL WHERE linear_milestone_id IS NOT NULL;
