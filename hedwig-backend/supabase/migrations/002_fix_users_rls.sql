-- Fix RLS policies to allow service role to insert users
-- This migration adds a policy that allows inserts without auth.uid() requirement

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert their own data" ON users;

-- Create a new INSERT policy that allows service role and authenticated users
CREATE POLICY "Allow user creation"
    ON users FOR INSERT
    WITH CHECK (true);

-- Keep the existing SELECT and UPDATE policies as they are
-- They will still restrict users to only see/update their own data
