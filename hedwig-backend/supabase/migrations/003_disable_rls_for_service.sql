-- Alternative fix: Disable RLS enforcement for service role inserts
-- Run this in Supabase SQL Editor

-- First, check current policies
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'users';

-- Drop ALL existing INSERT policies on users table
DROP POLICY IF EXISTS "Users can insert their own data" ON users;
DROP POLICY IF EXISTS "Allow user creation" ON users;

-- Create a permissive policy that allows all inserts (service role will bypass this anyway)
CREATE POLICY "Enable insert for all users" 
    ON users 
    FOR INSERT 
    TO public
    WITH CHECK (true);

-- Verify the policies
SELECT policyname, cmd, permissive, roles, qual, with_check 
FROM pg_policies 
WHERE tablename = 'users';
