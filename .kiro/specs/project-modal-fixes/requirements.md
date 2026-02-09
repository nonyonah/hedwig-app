# Project Modal Fixes - Requirements

## Overview
Fix two critical issues with the project modal: (1) scrolling behavior that causes content to bounce back to the top, and (2) missing BlockRadar payment links when creating invoices from project milestones.

## Problem Statement
1. **Project modal scrolling is broken**: Users cannot scroll through project details and milestones properly - the content bounces back to the top, making it impossible to view or interact with content below the fold.
2. **Milestone invoices missing BlockRadar links**: When users create invoices from project milestones, the invoices don't include BlockRadar payment links, unlike invoices created through other flows. This breaks the payment collection workflow.

## User Stories

### 1. Project Modal Scrolling
**As a** freelancer  
**I want** to scroll through all project details and milestones in the project modal  
**So that** I can view and interact with all project information without the content bouncing back

**Acceptance Criteria:**
- 1.1 Project modal content scrolls smoothly without bouncing back to top
- 1.2 Users can scroll to view all milestones in long project lists
- 1.3 Scroll behavior works consistently on both iOS and Android
- 1.4 Modal maintains scroll position when interacting with milestone actions
- 1.5 Nested scrolling (if any) works properly within the modal

### 2. BlockRadar Link Generation for Milestone Invoices
**As a** freelancer  
**I want** invoices created from project milestones to include BlockRadar payment links  
**So that** clients can pay invoices using the same payment flow as other invoices

**Acceptance Criteria:**
- 2.1 Milestone invoices include BlockRadar payment links when created
- 2.2 BlockRadar links have proper redirect URLs pointing to the invoice page
- 2.3 BlockRadar links include success messages for completed payments
- 2.4 BlockRadar links include complete metadata (documentId, userId, type, clientName, milestoneId)
- 2.5 Invoice creation from milestones matches the same BlockRadar implementation as regular invoices
- 2.6 Payment link is stored in the invoice document's `payment_link_url` field
- 2.7 Payment link is stored in the invoice document's `content.blockradar_url` field

### 3. Consistent Invoice Creation
**As a** developer  
**I want** all invoice creation paths to use the same BlockRadar link generation logic  
**So that** payment collection works consistently across the application

**Acceptance Criteria:**
- 3.1 Milestone invoice creation uses identical BlockRadar parameters as regular invoices
- 3.2 Both flows include: name, description, amount, redirectUrl, successMessage, metadata
- 3.3 Error handling for BlockRadar failures is consistent across both flows
- 3.4 Logging for BlockRadar link generation is consistent
- 3.5 Invoice documents are updated with BlockRadar URLs in the same way

## Technical Context

### Current Implementation

#### Scrolling Issue
- **File**: `app/projects/index.tsx` (lines 470-490)
- **Component**: `BottomSheetModal` with `BottomSheetFlatList`
- **Problem**: Parent `View` has `flex: 1` which may conflict with scroll behavior
- **Current Config**: `showsVerticalScrollIndicator={false}`, `contentContainerStyle={{ paddingBottom: 32 }}`
- **Missing**: `nestedScrollEnabled={true}` or proper flex layout adjustment

#### BlockRadar Link Issue
- **File**: `hedwig-backend/src/routes/milestone.ts` (lines 360-480)
- **Endpoint**: `POST /api/milestones/:id/invoice`
- **Problem**: Incomplete BlockRadar parameters compared to regular invoice creation

**Current Milestone Implementation** (INCOMPLETE):
```typescript
const paymentLink = await BlockradarService.createPaymentLink({
    amount: milestone.amount.toString(),
    currency: asset,  // ❌ Wrong parameter
    name: `Inv: ${invoiceTitle}`,
    description: `Payment for ${milestone.title}`,
    redirectUrl: `${process.env.WEB_CLIENT_URL || 'https://hedwig.money'}/success`,  // ❌ Generic redirect
    metadata: { clientName: client.name || 'Client', milestoneId: milestone.id, invoiceId: invoice.id }
    // ❌ Missing: successMessage
    // ❌ Missing: proper metadata structure
});
```

**Regular Invoice Implementation** (COMPLETE):
```typescript
const brLink = await BlockradarService.createPaymentLink({
    name: `Invoice ${doc.id.substring(0, 8)} - ${clientName || 'Client'}`,
    description: itemsMemo,
    amount: amount.toString(),
    redirectUrl: `${WEB_CLIENT_URL}/invoice/${doc.id}?status=success`,  // ✅ Specific redirect
    successMessage: `Thank you for your payment! Invoice ${doc.id.substring(0, 8)} has been paid.`,  // ✅ Has this
    metadata: {
        documentId: doc.id,
        userId: user.id,
        type: 'INVOICE',
        clientName: clientName || 'Unknown',
        itemCount: items?.length || 0
    }
});
```

### Affected Files
- `app/projects/index.tsx` - Project modal UI and scrolling
- `hedwig-backend/src/routes/milestone.ts` - Milestone invoice creation
- `hedwig-backend/src/routes/document.ts` - Regular invoice creation (reference implementation)
- `hedwig-backend/src/services/blockradar.ts` - BlockRadar service (if parameter validation exists)

## Constraints
- Must maintain backward compatibility with existing invoices
- Should not break existing project modal functionality
- BlockRadar link generation must handle failures gracefully
- Scrolling fix should work on both iOS and Android platforms
- Must use the same WEB_CLIENT_URL environment variable for consistency

## Success Metrics
- Users can scroll through entire project modal content without bouncing
- 100% of milestone invoices include BlockRadar payment links
- BlockRadar link generation success rate matches regular invoices
- Zero payment collection failures due to missing links
- Consistent invoice structure across all creation paths

## Out of Scope
- Redesigning the project modal UI
- Adding new BlockRadar features
- Changing invoice data structure
- Modifying payment flow logic beyond link generation
- Adding email notifications for milestone invoices (separate feature)
