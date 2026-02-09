# Project, Milestone, and Contract Fixes

## Issues Identified

### 1. Milestones Not Showing After Project Creation
**Status**: FIXED

**Problem**: 
- Milestones were being created but not returned in the response
- Logging showed `count: 0` for milestones

**Root Cause**:
- The response was returning `milestones: createdMilestones` at the wrong level
- Should be nested inside the `project` object

**Fix Applied**:
- Updated `hedwig-backend/src/routes/project.ts` POST endpoint
- Moved milestones into the project object in the response
- Added enhanced logging to track milestone creation
- Removed `user_id` from milestone insert (not in schema)

**Changes**:
```typescript
// Before
res.json({
    success: true,
    data: {
        project: { ...projectData },
        milestones: createdMilestones  // Wrong level
    }
});

// After
res.json({
    success: true,
    data: {
        project: {
            ...projectData,
            milestones: createdMilestones.map(...)  // Inside project
        }
    }
});
```

### 2. Contract Not Found After Creation
**Status**: NEEDS FRONTEND CHECK

**Backend Status**: ✅ Working correctly
- Contract creation in `actions.ts` is correct
- Contract is linked to project via `project_id`
- Contract GET endpoint in `document.ts` works correctly
- Contracts are fetched in project list endpoint

**Possible Frontend Issues**:
1. **Wrong contract ID being used**
   - Check if frontend is using correct contract ID from response
   
2. **Wrong endpoint being called**
   - Should call: `GET /api/documents/:id`
   - Not: `GET /api/contracts/:id` (doesn't exist)

3. **Missing authentication**
   - Contract endpoint requires auth token
   - Check if token is being passed

**How to Debug**:
- Check browser console for API errors
- Check network tab for the actual request being made
- Verify the contract ID in the database matches what frontend is requesting

### 3. Invoice Generation After Contract Approval
**Status**: ✅ ALREADY IMPLEMENTED

**Current Flow**:
1. Contract is created and sent to client
2. Client clicks approval link: `GET /api/documents/approve/:id/:token`
3. Backend creates invoices for each milestone
4. Invoices are sent via email to client
5. Milestones are updated with `invoice_id` and status `invoiced`

**Code Location**: `hedwig-backend/src/routes/document.ts` lines 1340-1480

**What Happens on Approval**:
```typescript
// For each milestone in contract:
1. Create invoice document with type='INVOICE'
2. Link invoice to milestone via invoice_id
3. Update milestone status to 'invoiced'
4. Send invoice email to client
5. Create notification for freelancer
```

## Testing Checklist

### Test Milestone Creation:
1. Create a new project with milestones
2. Check backend logs for:
   ```
   [INFO] Creating milestones {"count":X,"projectId":"..."}
   [INFO] Milestones created successfully {"count":X}
   ```
3. Verify response includes milestones array inside project object
4. Check database: `SELECT * FROM milestones WHERE project_id = 'xxx'`

### Test Contract Viewing:
1. Create a project (contract is auto-created)
2. Note the contract ID from logs
3. Try to fetch: `GET /api/documents/{contract_id}`
4. Should return contract with type='CONTRACT'
5. Check frontend is calling correct endpoint

### Test Contract Approval Flow:
1. Create contract with milestones
2. Get approval link from email or logs
3. Click approval link
4. Check logs for invoice creation
5. Verify invoices created in database
6. Verify milestones updated with invoice_id
7. Check client receives invoice emails

## Database Schema Reference

### Projects Table:
```sql
- id (TEXT, PK)
- user_id (TEXT, FK to users)
- client_id (TEXT, FK to clients)
- name (TEXT)
- description (TEXT)
- status (project_status ENUM)
- budget (DECIMAL)
- currency (TEXT)
- start_date (TIMESTAMPTZ)
- deadline (TIMESTAMPTZ)
- end_date (TIMESTAMPTZ)
```

### Milestones Table:
```sql
- id (TEXT, PK)
- project_id (TEXT, FK to projects)
- title (TEXT)
- amount (DECIMAL)
- due_date (TIMESTAMPTZ)
- status (milestone_status ENUM: pending, invoiced, paid)
- invoice_id (TEXT, FK to documents)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

### Documents Table (for contracts/invoices):
```sql
- id (TEXT, PK)
- user_id (TEXT, FK to users)
- client_id (TEXT, FK to clients)
- project_id (TEXT, FK to projects)  -- Links contract to project
- type (document_type ENUM: INVOICE, PAYMENT_LINK, CONTRACT)
- title (TEXT)
- status (document_status ENUM)
- amount (DECIMAL)
- content (JSONB)  -- Contains milestones, approval_token, etc.
```

## API Endpoints Reference

### Projects:
- `POST /api/projects` - Create project with milestones
- `GET /api/projects` - List all projects with milestones
- `GET /api/projects/:id` - Get single project with milestones

### Contracts:
- `GET /api/documents/:id` - Get contract by ID
- `GET /api/documents/approve/:id/:token` - Approve contract (creates invoices)

### Invoices:
- `GET /api/documents/:id` - Get invoice by ID (same endpoint as contracts)
- `POST /api/documents/:id/pay` - Mark invoice as paid

## Next Steps

1. **Deploy backend changes** to get milestone fixes
2. **Test project creation** and verify milestones appear
3. **Check frontend contract fetching** - ensure correct endpoint and ID
4. **Test full flow**: Project → Contract → Approval → Invoices
5. **Monitor logs** for any errors during the flow
