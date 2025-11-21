# Supabase Setup Guide for Hedwig Backend

This guide will help you set up Supabase as the database for the Hedwig backend.

## Overview

Hedwig now uses **Supabase** (PostgreSQL) as its database provider instead of a local PostgreSQL instance. Supabase provides:
- Managed PostgreSQL database
- Connection pooling (via PgBouncer)
- Row Level Security (RLS)
- Real-time subscriptions (if needed in the future)
- Built-in authentication (optional, we use Privy)
- Auto-generated REST API

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in the project details:
   - **Name**: `hedwig-backend` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the closest region to your users (e.g., `us-west-1` for US)
   - **Pricing Plan**: Start with the Free tier for development
4. Click "Create new project"
5. Wait for the project to be provisioned (~2 minutes)

## Step 2: Get Your Database Connection Strings

Once your project is ready:

1. Go to **Project Settings** > **Database**
2. Scroll down to **Connection string**
3. Under **Connection pooling**, select **URI** mode
4. You'll see two connection strings:

### Connection Pooler URL (for Prisma queries)
```
postgresql://postgres.xxxxxxxxxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
This uses port `6543` and includes `pgbouncer=true`

### Direct Connection URL (for migrations)
```
postgresql://postgres.xxxxxxxxxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```
This uses port `5432` (standard PostgreSQL port)

## Step 3: Set Up Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the database URLs in `.env`:
   ```bash
   # Connection pooler URL (used by Prisma for queries)
   DATABASE_URL="postgresql://postgres.xxxxxxxxxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   
   # Direct connection URL (used by Prisma for migrations)
   DIRECT_URL="postgresql://postgres.xxxxxxxxxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
   ```

3. Replace:
   - `xxxxxxxxxxxxxxxxxxxx` with your actual project reference
   - `[YOUR-PASSWORD]` with your database password
   - `aws-0-us-west-1` with your actual region

## Step 4: Run the Initial Migration

You have two options to set up the database schema:

### Option A: Using the SQL Migration File (Recommended for Supabase)

1. Go to **Supabase Dashboard** > **SQL Editor**
2. Click "New query"
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. Paste it into the SQL editor
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Verify that all tables were created successfully

This method:
- ✅ Creates all tables, indexes, and enums
- ✅ Sets up Row Level Security (RLS) policies
- ✅ Creates automatic `updated_at` triggers
- ✅ Optimizes for Supabase-specific features

### Option B: Using Prisma Migrate (Alternative)

If you prefer to use Prisma:

```bash
# Generate Prisma Client
npx prisma generate

# Push the schema to Supabase (development)
npx prisma db push

# Or create a migration (production-ready)
npx prisma migrate dev --name initial_schema
```

**Note**: Using Prisma won't set up the RLS policies automatically. You'll need to run the RLS policy SQL separately (lines 379-432 from the migration file).

## Step 5: Verify the Setup

### Check Tables in Supabase Dashboard

1. Go to **Table Editor** in your Supabase dashboard
2. You should see all tables:
   - `users`
   - `clients`
   - `projects`
   - `documents`
   - `transactions`
   - `offramp_orders`
   - `conversations`
   - `messages`

### Test Connection from Backend

```bash
# Install dependencies if not already installed
npm install

# Test Prisma connection
npx prisma db pull

# Generate Prisma Client
npx prisma generate
```

## Step 6: Row Level Security (RLS) Policies

The migration file automatically sets up RLS policies that:
- Ensure users can only access their own data
- Use Supabase auth (`auth.uid()`) to validate user identity
- Provide secure access control at the database level

To view/modify RLS policies:
1. Go to **Authentication** > **Policies** in Supabase dashboard
2. Select a table to view its policies

## Schema Overview

The schema includes:

### Tables
- **users**: User profiles linked to Privy authentication
- **clients**: Client management for freelancers
- **projects**: Project tracking per client
- **documents**: Invoices, proposals, contracts, payment links
- **transactions**: Blockchain transaction records
- **offramp_orders**: Paycrest offramp orders
- **conversations**: AI chat conversations
- **messages**: Individual messages in conversations

### Enums
- `project_status`: ACTIVE, COMPLETED, ON_HOLD, CANCELLED
- `document_type`: INVOICE, PROPOSAL, CONTRACT, PAYMENT_LINK
- `document_status`: DRAFT, SENT, VIEWED, PAID, CANCELLED
- `transaction_type`: PAYMENT_RECEIVED, PAYMENT_SENT, OFFRAMP, FEE_COLLECTION
- `transaction_status`: PENDING, CONFIRMED, FAILED, CANCELLED
- `chain`: BASE, CELO, SOLANA
- `offramp_status`: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED
- `message_role`: USER, ASSISTANT, SYSTEM

## Useful Supabase Features

### SQL Editor
- Run custom SQL queries
- Create functions and triggers
- Manage extensions

### Table Editor
- Visual interface for browsing data
- Insert/update/delete rows manually
- View table structure

### Database Backups
- Free tier: Daily backups (1 day retention)
- Paid tiers: Point-in-time recovery

### Monitoring
- **Database** > **Reports**: View query performance
- **Database** > **Connection pooler**: Monitor connections

## Development Workflow

### Making Schema Changes

1. Update `prisma/schema.prisma`
2. Generate a new migration:
   ```bash
   npx prisma migrate dev --name descriptive_name
   ```
3. The migration will be applied to your Supabase database
4. Commit the migration files to version control

### Production Deployment

1. Update environment variables with production Supabase URLs
2. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

## Troubleshooting

### Connection Timeout
- Check that you're using the correct connection string
- Verify your IP is not blocked (Supabase allows all IPs by default)
- Check if connection pooling URL includes `?pgbouncer=true`

### Migration Errors
- Use `DIRECT_URL` for migrations (port 5432)
- Ensure database password is correctly escaped in URL
- Check Supabase project is not paused (free tier)

### RLS Blocking Queries
- RLS policies require authentication context
- Use Prisma client from backend (with service role key if needed)
- Or disable RLS for specific tables during development:
  ```sql
  ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
  ```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Prisma with Supabase Guide](https://www.prisma.io/docs/guides/database/supabase)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Row Level Security Policies](https://supabase.com/docs/guides/auth/row-level-security)

## Support

If you encounter issues:
1. Check Supabase Dashboard > **Project Settings** > **API** for service status
2. Review logs in **Database** > **Logs**
3. Join [Supabase Discord](https://discord.supabase.com) for community support
