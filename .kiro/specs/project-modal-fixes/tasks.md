# Implementation Plan: Project Modal Fixes

## Overview

This implementation plan addresses two critical bugs: (1) fixing the project modal scrolling behavior by removing a layout constraint, and (2) completing the BlockRadar payment link generation for milestone invoices to match the reference implementation in regular invoice creation.

The implementation is straightforward with minimal code changes, focusing on layout adjustment and parameter alignment.

## Tasks

- [x] 1. Fix project modal scrolling layout
  - Remove `flex: 1` from parent View in BottomSheetModal
  - Verify BottomSheetFlatList retains `style={{ flex: 1 }}`
  - Test scrolling behavior on both iOS and Android
  - File: `app/projects/index.tsx` (line ~475)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Update BlockRadar payment link parameters for milestone invoices
  - [x] 2.1 Update BlockRadar createPaymentLink call in milestone route
    - Remove `currency` parameter (not in reference implementation)
    - Update `name` format to: `Invoice ${invoice.id.substring(0, 8)} - ${client.name || 'Client'}`
    - Update `description` to include milestone and project name
    - Update `redirectUrl` to: `${WEB_CLIENT_URL}/invoice/${invoice.id}?status=success`
    - Add `successMessage` parameter with invoice ID reference
    - Update metadata structure: change `invoiceId` to `documentId`, add `userId`, add `type: 'INVOICE'`, ensure `clientName` fallback to 'Unknown'
    - File: `hedwig-backend/src/routes/milestone.ts` (lines ~460-475)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2_

  - [ ]* 2.2 Write property test for milestone invoice BlockRadar link inclusion
    - **Property 1: Milestone invoices include BlockRadar payment links**
    - **Validates: Requirements 2.1**
    - Test that invoices created with network/token include non-empty payment_link_url
    - Use fast-check to generate random network/token/amount combinations
    - Minimum 100 iterations

  - [ ]* 2.3 Write property test for BlockRadar parameter completeness
    - **Property 2: BlockRadar parameters are complete and consistent**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 3.1, 3.2**
    - Test that all required parameters are passed to BlockRadar service
    - Verify format correctness (name, redirectUrl, successMessage, metadata structure)
    - Use fast-check to generate random client names, milestone titles, amounts
    - Mock BlockRadar service to capture parameters
    - Minimum 100 iterations

  - [ ]* 2.4 Write property test for payment link storage in both fields
    - **Property 3: Payment links are stored in both database fields**
    - **Validates: Requirements 2.6, 2.7, 3.5**
    - Test that payment_link_url and content.blockradar_url both contain the URL
    - Use fast-check to generate random URLs
    - Minimum 100 iterations

  - [ ]* 2.5 Write property test for BlockRadar failure handling
    - **Property 4: BlockRadar failures don't prevent invoice creation**
    - **Validates: Requirements 3.3**
    - Test that invoice is created even when BlockRadar throws errors
    - Mock BlockRadar to fail with different error types
    - Verify error is logged
    - Use fast-check to generate random error scenarios
    - Minimum 100 iterations

  - [ ]* 2.6 Write unit tests for milestone invoice creation
    - Test invoice title format
    - Test missing client email handling
    - Test clientName fallback to 'Unknown'
    - Test error logging when BlockRadar fails
    - _Requirements: 3.3, 3.4_

- [x] 3. Update error logging for consistency
  - Update error log message to: 'Failed to generate BlockRadar link for milestone invoice'
  - Ensure log includes: error message, invoiceId, milestoneId
  - Match logging pattern from document.ts
  - File: `hedwig-backend/src/routes/milestone.ts` (lines ~490-495)
  - _Requirements: 3.4_

- [ ] 4. Checkpoint - Verify implementation and run tests
  - Ensure all tests pass
  - Manually test scrolling on iOS and Android devices/simulators
  - Verify milestone invoice creation includes BlockRadar links
  - Check logs for proper error handling
  - Ask the user if questions arise

- [ ] 5. Integration testing
  - [ ] 5.1 Test milestone invoice creation with valid network/token
    - Verify BlockRadar link in response
    - Verify both payment_link_url and content.blockradar_url are populated
    - _Requirements: 2.1, 2.6, 2.7_

  - [ ] 5.2 Test milestone invoice creation without network/token
    - Verify invoice created successfully
    - Verify no BlockRadar link (expected behavior)
    - _Requirements: 2.1_

  - [ ] 5.3 Test milestone invoice creation with BlockRadar failure
    - Mock BlockRadar to fail
    - Verify invoice still created
    - Verify error logged with correct context
    - _Requirements: 3.3, 3.4_

  - [ ] 5.4 Compare milestone and regular invoice BlockRadar parameters
    - Create both types of invoices
    - Capture parameters passed to BlockRadar
    - Verify identical structure and format
    - _Requirements: 2.5, 3.1, 3.2_

- [ ] 6. Final checkpoint - Ensure all tests pass
  - Run full test suite
  - Verify no regressions in existing functionality
  - Confirm scrolling works smoothly on both platforms
  - Confirm BlockRadar links are generated correctly
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The scrolling fix is a simple layout change with no logic modifications
- The BlockRadar fix aligns milestone invoice creation with the existing reference implementation
- All BlockRadar parameters should match the format in `hedwig-backend/src/routes/document.ts`
- Error handling ensures invoice creation succeeds even if BlockRadar fails
- Property tests use fast-check library with minimum 100 iterations
- Manual testing on actual devices is important for verifying scrolling behavior
