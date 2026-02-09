# Project Modal Fixes - Design Document

## Overview

This design addresses two critical bugs in the Hedwig application:

1. **Project Modal Scrolling Issue**: The project modal uses a `BottomSheetFlatList` within a `View` with `flex: 1`, which creates a layout conflict preventing proper scrolling. Content bounces back to the top instead of scrolling smoothly.

2. **Missing BlockRadar Payment Links**: When creating invoices from project milestones, the BlockRadar payment link generation is incomplete compared to the reference implementation in regular invoice creation. Missing parameters include proper redirect URLs, success messages, and complete metadata structure.

Both issues have straightforward solutions that align with existing patterns in the codebase.

## Architecture

### High-Level Component Structure

```
┌─────────────────────────────────────┐
│   app/projects/index.tsx            │
│   ┌───────────────────────────────┐ │
│   │  BottomSheetModal             │ │
│   │  ┌─────────────────────────┐  │ │
│   │  │ View (remove flex: 1)   │  │ │  ← Fix scrolling
│   │  │  ┌───────────────────┐  │  │ │
│   │  │  │BottomSheetFlatList│  │  │ │
│   │  │  └───────────────────┘  │  │ │
│   │  └─────────────────────────┘  │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ hedwig-backend/src/routes/          │
│                                     │
│  milestone.ts                       │
│  ┌───────────────────────────────┐  │
│  │ POST /milestones/:id/invoice  │  │
│  │  ↓                            │  │
│  │ BlockradarService             │  │  ← Fix parameters
│  │  .createPaymentLink()         │  │
│  └───────────────────────────────┘  │
│                                     │
│  document.ts (reference)            │
│  ┌───────────────────────────────┐  │
│  │ POST /documents (invoice)     │  │
│  │  ↓                            │  │
│  │ BlockradarService             │  │
│  │  .createPaymentLink()         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Data Flow

**Scrolling Fix**:
- User opens project modal → BottomSheetModal renders
- BottomSheetFlatList receives milestone data
- Parent View no longer constrains with `flex: 1`
- FlatList handles its own scrolling naturally

**BlockRadar Link Fix**:
- User creates invoice from milestone → POST /api/milestones/:id/invoice
- Backend creates invoice document in Supabase
- BlockradarService.createPaymentLink() called with complete parameters
- Payment link stored in both `payment_link_url` and `content.blockradar_url`
- Invoice returned with payment link included

## Components and Interfaces

### Frontend Component Changes

**File**: `app/projects/index.tsx`

**Current Implementation** (lines ~475):
```typescript
<View style={{ paddingBottom: 40, paddingHorizontal: 24, flex: 1 }}>
  {/* Modal Header */}
  {selectedProject && (
    <BottomSheetFlatList
      data={selectedProject.milestones || []}
      // ... other props
    />
  )}
</View>
```

**Proposed Fix**:
```typescript
<View style={{ paddingBottom: 40, paddingHorizontal: 24 }}>
  {/* Modal Header */}
  {selectedProject && (
    <BottomSheetFlatList
      data={selectedProject.milestones || []}
      style={{ flex: 1 }}
      // ... other props
    />
  )}
</View>
```

**Key Changes**:
- Remove `flex: 1` from parent `View`
- Keep `flex: 1` on `BottomSheetFlatList` (already present)
- This allows the FlatList to manage its own scroll container

### Backend API Changes

**File**: `hedwig-backend/src/routes/milestone.ts`

**Interface**: BlockRadar Payment Link Parameters

```typescript
interface BlockRadarPaymentLinkParams {
  name: string;           // Invoice identifier with client name
  description: string;    // Detailed description of items/milestone
  amount: string;         // Amount as string
  redirectUrl: string;    // Specific invoice page URL with success query param
  successMessage: string; // User-friendly payment confirmation message
  metadata: {
    documentId: string;   // Invoice document ID
    userId: string;       // User ID who created the invoice
    type: string;         // Always 'INVOICE'
    clientName: string;   // Client name for reference
    milestoneId?: string; // Milestone ID (specific to milestone invoices)
    itemCount?: number;   // Number of items (for regular invoices)
  };
}
```

**Current Implementation** (lines 460-475):
```typescript
const paymentLink = await BlockradarService.createPaymentLink({
    amount: milestone.amount.toString(),
    currency: asset,  // ❌ Wrong parameter name
    name: `Inv: ${invoiceTitle}`,
    description: `Payment for ${milestone.title}`,
    redirectUrl: `${process.env.WEB_CLIENT_URL || 'https://hedwig.money'}/success`,  // ❌ Generic
    metadata: {
        clientName: client.name || 'Client',
        milestoneId: milestone.id,
        invoiceId: invoice.id  // ❌ Should be documentId
    }
    // ❌ Missing: successMessage
    // ❌ Missing: userId, type in metadata
});
```

**Proposed Implementation**:
```typescript
const paymentLink = await BlockradarService.createPaymentLink({
    name: `Invoice ${invoice.id.substring(0, 8)} - ${client.name || 'Client'}`,
    description: `Milestone: ${milestone.title} - ${milestone.project.name}`,
    amount: milestone.amount.toString(),
    redirectUrl: `${process.env.WEB_CLIENT_URL || 'https://hedwig.money'}/invoice/${invoice.id}?status=success`,
    successMessage: `Thank you for your payment! Invoice ${invoice.id.substring(0, 8)} has been paid.`,
    metadata: {
        documentId: invoice.id,
        userId: user.id,
        type: 'INVOICE',
        clientName: client.name || 'Unknown',
        milestoneId: milestone.id
    }
});
```

**Key Changes**:
1. Remove `currency` parameter (not in reference implementation)
2. Update `name` format to match reference: `Invoice {id} - {clientName}`
3. Update `description` to include both milestone and project name
4. Change `redirectUrl` to point to specific invoice page with `?status=success`
5. Add `successMessage` with invoice ID reference
6. Update metadata structure:
   - Change `invoiceId` → `documentId`
   - Add `userId` field
   - Add `type: 'INVOICE'` field
   - Ensure `clientName` has fallback to 'Unknown'

### Database Schema

**No schema changes required**. The invoice document structure already supports:
- `payment_link_url` (top-level field)
- `content.blockradar_url` (nested field)
- `content.blockradar_uuid` (nested field)

Both fields are updated after BlockRadar link creation.

## Data Models

### Invoice Document Model

```typescript
interface InvoiceDocument {
  id: string;
  user_id: string;
  client_id: string;
  project_id?: string;
  type: 'INVOICE';
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'SENT' | 'PAID';
  payment_link_url?: string;  // BlockRadar URL stored here
  content: {
    client_name: string;
    client_email?: string;
    client_company?: string;
    items: Array<{
      description: string;
      quantity: number;
      rate: number;
      amount: number;
    }>;
    network?: string;
    token?: string;
    milestone_id?: string;
    project_name?: string;
    blockradar_url?: string;    // Also stored here for backward compatibility
    blockradar_uuid?: string;
  };
  created_at: string;
  updated_at: string;
}
```

### Milestone Model

```typescript
interface Milestone {
  id: string;
  project_id: string;
  title: string;
  amount: number;
  due_date?: string;
  status: 'pending' | 'invoiced' | 'paid';
  invoice_id?: string;
  created_at: string;
  updated_at: string;
}
```

### BlockRadar Response Model

```typescript
interface BlockRadarPaymentLink {
  url: string;      // The payment link URL
  uuid: string;     // Unique identifier for the payment link
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Milestone invoices include BlockRadar payment links
*For any* milestone invoice creation request with network and token specified, the created invoice document should contain a non-empty payment link URL.

**Validates: Requirements 2.1**

### Property 2: BlockRadar parameters are complete and consistent
*For any* invoice creation (milestone or regular), the parameters passed to BlockRadar service should include all required fields (name, description, amount, redirectUrl, successMessage, metadata) with the same structure and format, where:
- `name` follows format: `Invoice {id.substring(0,8)} - {clientName}`
- `redirectUrl` points to: `{WEB_CLIENT_URL}/invoice/{invoiceId}?status=success`
- `successMessage` includes the invoice ID
- `metadata` contains: `documentId`, `userId`, `type: 'INVOICE'`, `clientName`, and optionally `milestoneId`

**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 3.1, 3.2**

### Property 3: Payment links are stored in both database fields
*For any* successfully created BlockRadar payment link, the invoice document should be updated with the payment URL stored in both `payment_link_url` (top-level field) and `content.blockradar_url` (nested field).

**Validates: Requirements 2.6, 2.7, 3.5**

### Property 4: BlockRadar failures don't prevent invoice creation
*For any* milestone invoice creation where BlockRadar service fails, the invoice document should still be created successfully and the error should be logged without throwing an exception.

**Validates: Requirements 3.3**

## Error Handling

### Frontend Error Handling

**Scrolling Issue**: No specific error handling needed. The layout fix is structural and doesn't introduce new error conditions.

**Potential Issues**:
- If `BottomSheetFlatList` fails to render, the existing error boundaries will catch it
- No new error states introduced by removing `flex: 1`

### Backend Error Handling

**BlockRadar Service Failures**:

```typescript
try {
    const paymentLink = await BlockradarService.createPaymentLink({
        // ... parameters
    });
    
    if (paymentLink && paymentLink.url) {
        // Update invoice with payment link
        await supabase.from('documents').update({
            payment_link_url: paymentLink.url,
            content: {
                ...invoice.content,
                blockradar_url: paymentLink.url,
                blockradar_uuid: paymentLink.uuid
            }
        }).eq('id', invoice.id);
    }
} catch (brError: any) {
    logger.error('Failed to generate BlockRadar link for milestone invoice', {
        error: brError.message,
        invoiceId: invoice.id,
        milestoneId: milestone.id
    });
    // Don't fail the request - invoice was created successfully
}
```

**Error Handling Strategy**:
1. **Non-blocking failures**: BlockRadar failures should not prevent invoice creation
2. **Comprehensive logging**: Log all relevant context (invoiceId, milestoneId, error message)
3. **Graceful degradation**: Invoice is still usable without BlockRadar link
4. **Consistent behavior**: Same error handling as regular invoice creation

**Error Scenarios**:
- BlockRadar API is down → Invoice created, error logged, no payment link
- Invalid parameters → Invoice created, error logged, no payment link
- Network timeout → Invoice created, error logged, no payment link
- Database update fails → Invoice exists but payment link not stored (rare edge case)

### Logging Strategy

**Milestone Invoice Creation**:
```typescript
logger.info('Creating invoice from milestone', {
    milestoneId: milestone.id,
    projectId: milestone.project.id,
    amount: milestone.amount
});

// After BlockRadar success
logger.info('Generated BlockRadar link for milestone invoice', {
    invoiceId: invoice.id,
    milestoneId: milestone.id,
    url: paymentLink.url
});

// On BlockRadar failure
logger.error('Failed to generate BlockRadar link for milestone invoice', {
    error: brError.message,
    invoiceId: invoice.id,
    milestoneId: milestone.id
});
```

This matches the logging pattern in `document.ts` for consistency.

## Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Both are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across many randomized inputs.

### Frontend Testing

**Scrolling Fix**:

Since the scrolling issue is primarily a UI/layout behavior, testing will focus on:

1. **Manual Testing** (Primary):
   - Test on iOS device/simulator with long project lists (10+ milestones)
   - Test on Android device/emulator with long project lists
   - Verify smooth scrolling without bounce-back
   - Verify scroll position maintained during interactions

2. **Component Tests** (Secondary):
   - Verify `BottomSheetFlatList` renders with correct props
   - Verify parent `View` does not have `flex: 1` style
   - Verify `BottomSheetFlatList` has `style={{ flex: 1 }}`

**Test File**: `app/projects/__tests__/index.test.tsx`

```typescript
describe('Project Modal Scrolling', () => {
  it('should render BottomSheetFlatList without parent flex constraint', () => {
    // Verify parent View doesn't have flex: 1
    // Verify BottomSheetFlatList has flex: 1
  });
  
  it('should render all milestones in the list', () => {
    // Verify FlatList receives all milestone data
  });
});
```

### Backend Testing

**Property-Based Testing Library**: Use **fast-check** (JavaScript/TypeScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property number

**Test File**: `hedwig-backend/src/routes/__tests__/milestone.test.ts`

#### Property Tests

```typescript
import fc from 'fast-check';

/**
 * Feature: project-modal-fixes, Property 1
 * Milestone invoices include BlockRadar payment links
 */
describe('Property 1: Milestone invoices include BlockRadar payment links', () => {
  it('should include payment link when network and token are provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          network: fc.constantFrom('base', 'ethereum', 'polygon'),
          token: fc.constantFrom('USDC', 'ETH', 'MATIC'),
          amount: fc.float({ min: 0.01, max: 100000 })
        }),
        async ({ network, token, amount }) => {
          // Create milestone invoice with network/token
          const response = await createMilestoneInvoice({
            network,
            token,
            amount
          });
          
          // Verify payment link exists
          expect(response.payment_link_url).toBeTruthy();
          expect(response.payment_link_url).toMatch(/^https?:\/\//);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: project-modal-fixes, Property 2
 * BlockRadar parameters are complete and consistent
 */
describe('Property 2: BlockRadar parameters are complete and consistent', () => {
  it('should pass complete parameters to BlockRadar service', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          clientName: fc.string({ minLength: 1, maxLength: 50 }),
          milestoneTitle: fc.string({ minLength: 1, maxLength: 100 }),
          amount: fc.float({ min: 0.01, max: 100000 })
        }),
        async ({ clientName, milestoneTitle, amount }) => {
          // Mock BlockRadar service to capture parameters
          const capturedParams = await createMilestoneInvoiceAndCaptureParams({
            clientName,
            milestoneTitle,
            amount
          });
          
          // Verify all required fields present
          expect(capturedParams).toHaveProperty('name');
          expect(capturedParams).toHaveProperty('description');
          expect(capturedParams).toHaveProperty('amount');
          expect(capturedParams).toHaveProperty('redirectUrl');
          expect(capturedParams).toHaveProperty('successMessage');
          expect(capturedParams).toHaveProperty('metadata');
          
          // Verify format correctness
          expect(capturedParams.name).toMatch(/^Invoice [a-f0-9]{8} - /);
          expect(capturedParams.redirectUrl).toContain('/invoice/');
          expect(capturedParams.redirectUrl).toContain('?status=success');
          expect(capturedParams.successMessage).toContain('Invoice');
          
          // Verify metadata structure
          expect(capturedParams.metadata).toHaveProperty('documentId');
          expect(capturedParams.metadata).toHaveProperty('userId');
          expect(capturedParams.metadata).toHaveProperty('type');
          expect(capturedParams.metadata.type).toBe('INVOICE');
          expect(capturedParams.metadata).toHaveProperty('clientName');
          expect(capturedParams.metadata).toHaveProperty('milestoneId');
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: project-modal-fixes, Property 3
 * Payment links are stored in both database fields
 */
describe('Property 3: Payment links are stored in both database fields', () => {
  it('should store payment link in both payment_link_url and content.blockradar_url', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.webUrl(),
        async (paymentUrl) => {
          // Create invoice with mocked BlockRadar response
          const invoice = await createMilestoneInvoiceWithMockedLink(paymentUrl);
          
          // Verify both fields contain the URL
          expect(invoice.payment_link_url).toBe(paymentUrl);
          expect(invoice.content.blockradar_url).toBe(paymentUrl);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: project-modal-fixes, Property 4
 * BlockRadar failures don't prevent invoice creation
 */
describe('Property 4: BlockRadar failures don\'t prevent invoice creation', () => {
  it('should create invoice even when BlockRadar fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorType: fc.constantFrom('network', 'timeout', 'invalid_params', 'server_error'),
          milestoneAmount: fc.float({ min: 0.01, max: 100000 })
        }),
        async ({ errorType, milestoneAmount }) => {
          // Mock BlockRadar to throw error
          mockBlockRadarToFail(errorType);
          
          // Create milestone invoice
          const response = await createMilestoneInvoice({
            amount: milestoneAmount,
            network: 'base',
            token: 'USDC'
          });
          
          // Verify invoice was created despite BlockRadar failure
          expect(response.success).toBe(true);
          expect(response.invoice).toBeDefined();
          expect(response.invoice.id).toBeTruthy();
          
          // Verify error was logged (check logger mock)
          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to generate BlockRadar link'),
            expect.any(Object)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

#### Unit Tests

```typescript
describe('Milestone Invoice Creation - Unit Tests', () => {
  it('should create invoice with correct title format', async () => {
    const milestone = {
      title: 'Design Phase',
      project: { name: 'Website Redesign' }
    };
    
    const invoice = await createMilestoneInvoice(milestone);
    
    expect(invoice.title).toBe('Design Phase - Website Redesign');
  });
  
  it('should handle missing client email gracefully', async () => {
    const milestone = {
      project: {
        client: { name: 'Acme Corp', email: null }
      }
    };
    
    const invoice = await createMilestoneInvoice(milestone);
    
    expect(invoice).toBeDefined();
    // Should not throw error
  });
  
  it('should use fallback clientName when client name is missing', async () => {
    const milestone = {
      project: {
        client: { name: null }
      }
    };
    
    const capturedParams = await createMilestoneInvoiceAndCaptureParams(milestone);
    
    expect(capturedParams.metadata.clientName).toBe('Unknown');
  });
  
  it('should log error when BlockRadar fails', async () => {
    mockBlockRadarToFail('network');
    
    await createMilestoneInvoice({ amount: 100 });
    
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to generate BlockRadar link for milestone invoice',
      expect.objectContaining({
        error: expect.any(String),
        invoiceId: expect.any(String),
        milestoneId: expect.any(String)
      })
    );
  });
});
```

### Integration Testing

**Test Scenarios**:
1. Create milestone invoice with valid network/token → Verify BlockRadar link in response
2. Create milestone invoice without network/token → Verify invoice created without BlockRadar link
3. Create milestone invoice with BlockRadar failure → Verify invoice created, error logged
4. Compare milestone invoice and regular invoice BlockRadar parameters → Verify identical structure

### Test Coverage Goals

- **Unit test coverage**: 80%+ for milestone invoice creation logic
- **Property test coverage**: All 4 correctness properties implemented
- **Integration test coverage**: All critical paths (success, failure, edge cases)
- **Manual test coverage**: Both iOS and Android scrolling behavior verified

## Implementation Notes

### Frontend Implementation

**File**: `app/projects/index.tsx`

**Change Location**: Line ~475

**Before**:
```typescript
<View style={{ paddingBottom: 40, paddingHorizontal: 24, flex: 1 }}>
```

**After**:
```typescript
<View style={{ paddingBottom: 40, paddingHorizontal: 24 }}>
```

**Rationale**: The `flex: 1` on the parent View creates a layout conflict with `BottomSheetFlatList`. The FlatList should manage its own flex container for proper scrolling within the BottomSheet.

### Backend Implementation

**File**: `hedwig-backend/src/routes/milestone.ts`

**Change Location**: Lines ~460-475 (BlockRadar payment link creation)

**Key Changes**:
1. Remove `currency` parameter (not used in reference implementation)
2. Update parameter names and formats to match `document.ts`
3. Add `successMessage` parameter
4. Update metadata structure with all required fields
5. Ensure consistent error handling and logging

**Environment Variables**:
- `WEB_CLIENT_URL`: Used for redirect URL (already exists)

**Dependencies**:
- No new dependencies required
- Uses existing `BlockradarService`
- Uses existing Supabase client
- Uses existing logger

### Backward Compatibility

**Frontend**: No breaking changes. The layout fix only affects internal styling.

**Backend**: 
- Existing invoices are not affected
- New invoices will have complete BlockRadar parameters
- Both `payment_link_url` and `content.blockradar_url` are populated (maintains compatibility)
- Error handling ensures invoice creation succeeds even if BlockRadar fails

### Deployment Considerations

**Frontend**:
- No database migrations needed
- No environment variable changes needed
- Can be deployed independently

**Backend**:
- No database migrations needed
- Verify `WEB_CLIENT_URL` environment variable is set correctly
- Can be deployed independently
- Monitor BlockRadar error logs after deployment

### Performance Considerations

**Frontend**: 
- No performance impact
- Layout change is purely structural
- FlatList already handles virtualization for long lists

**Backend**:
- No additional API calls (BlockRadar already being called)
- No additional database queries
- Slightly more data in metadata object (negligible impact)

## Security Considerations

**Frontend**: No security implications from layout change.

**Backend**:
- BlockRadar parameters include user-provided data (client name, milestone title)
- Data is already sanitized by Supabase schema validation
- No SQL injection risk (using Supabase client)
- No XSS risk (data not rendered in backend)
- Metadata is passed to external service (BlockRadar) - ensure no sensitive data included

**Sensitive Data Check**:
- ✅ `documentId`: Safe (UUID)
- ✅ `userId`: Safe (UUID)
- ✅ `type`: Safe (constant string)
- ✅ `clientName`: Safe (display name only, no PII)
- ✅ `milestoneId`: Safe (UUID)

No sensitive information (passwords, tokens, full email addresses) is included in BlockRadar metadata.

## Future Enhancements

**Out of scope for this fix, but potential future improvements**:

1. **Email notifications**: Send email to client when milestone invoice is created
2. **Webhook handling**: Add webhook endpoint for BlockRadar payment confirmations
3. **Payment status tracking**: Real-time updates when payments are completed
4. **Retry logic**: Automatic retry for BlockRadar failures
5. **Analytics**: Track BlockRadar link generation success rates
6. **A/B testing**: Compare payment completion rates with/without BlockRadar links

## References

- **Reference Implementation**: `hedwig-backend/src/routes/document.ts` (lines 115-160)
- **BlockRadar Service**: `hedwig-backend/src/services/blockradar.ts`
- **BottomSheet Library**: [@gorhom/bottom-sheet](https://github.com/gorhom/react-native-bottom-sheet)
- **Property-Based Testing**: [fast-check documentation](https://github.com/dubzzz/fast-check)
