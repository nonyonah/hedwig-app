# Implementation Plan: Invoice Modal SwiftUI Migration

## Overview

This implementation plan migrates the invoice modal from `@gorhom/bottom-sheet` to `@expo/ui/swift-ui` BottomSheet component. The migration follows an incremental approach: first setting up the SwiftUI components with proper imports and fallbacks, then migrating the modal structure, followed by testing each piece of functionality, and finally cleaning up the old implementation.

## Tasks

- [x] 1. Set up SwiftUI component imports and fallbacks
  - Add conditional imports for SwiftUI BottomSheet and Host components (iOS only)
  - Implement try-catch error handling for import failures
  - Add console warnings for fallback scenarios
  - Keep existing Gorhom BottomSheetModal as fallback for Android and iOS errors
  - _Requirements: 1.1, 1.3, 1.4, 11.4, 12.1_

- [ ]* 1.1 Write property test for SwiftUI component loading
  - **Property 19: SwiftUI Component Loading Fallback**
  - **Validates: Requirements 12.1**

- [x] 2. Replace modal state management
  - Replace `useRef<BottomSheetModal>` with `useState<boolean>` for modal visibility
  - Update `openModal` function to use `setIsModalOpen(true)`
  - Update `closeModal` function to use `setIsModalOpen(false)`
  - Update `handleInvoicePress` to use new state management
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ]* 2.1 Write property test for modal state transitions
  - **Property 3: Modal State Transitions**
  - **Validates: Requirements 2.2, 2.3**

- [x] 3. Implement SwiftUI BottomSheet wrapper
  - [x] 3.1 Create conditional rendering logic for iOS vs Android
    - Check `Platform.OS === 'ios'` and SwiftUI component availability
    - Render SwiftUI BottomSheet with `isOpened` and `onDismiss` props on iOS when available
    - Keep existing Gorhom BottomSheetModal for Android and iOS fallback
    - _Requirements: 1.1, 1.4, 11.1, 11.2, 11.3_
  
  - [ ]* 3.2 Write property test for platform-specific component usage
    - **Property 2: Platform-Specific Component Usage**
    - **Validates: Requirements 1.1, 1.3, 1.4, 11.3, 11.4**

- [x] 4. Migrate modal content structure
  - [x] 4.1 Wrap modal content in Host component for iOS
    - Add `<Host>` wrapper around all modal content when using SwiftUI
    - Ensure Host has proper props for content rendering
    - Keep existing React Native components inside Host
    - _Requirements: 1.3_
  
  - [x] 4.2 Migrate modal header section
    - Move modal header JSX into Host wrapper
    - Verify status icon, title, timestamp render correctly
    - Verify menu button and close button work inside Host
    - _Requirements: 3.3, 3.7, 4.1_
  
  - [x] 4.3 Migrate action menu section
    - Move action menu JSX into Host wrapper
    - Verify menu backdrop, menu items, and icons render correctly
    - Ensure menu animations work with LayoutAnimation
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  
  - [x] 4.4 Migrate amount card section
    - Move amount card JSX into Host wrapper
    - Verify currency formatting and USDC display
    - _Requirements: 3.1_
  
  - [x] 4.5 Migrate details card section
    - Move details card JSX into Host wrapper
    - Verify invoice ID formatting, description, client name, chain info display
    - _Requirements: 3.2, 3.4, 3.5, 3.6_
  
  - [x] 4.6 Migrate view invoice button
    - Move view invoice button JSX into Host wrapper
    - Verify button styling and touch handling
    - _Requirements: 8.1_

- [ ]* 4.7 Write property test for complete invoice data display
  - **Property 1: Modal Opens with Complete Invoice Data Display**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

- [ ]* 4.8 Write property test for visual indicators
  - **Property 14: Visual Indicators Match Invoice State**
  - **Validates: Requirements 9.3, 9.5**

- [ ] 5. Checkpoint - Verify modal renders correctly
  - Test modal opens and closes on iOS with SwiftUI
  - Test modal opens and closes on Android with fallback
  - Test all content sections display correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement action menu functionality
  - [x] 6.1 Implement action menu visibility toggle
    - Wire up menu button onPress to toggle showActionMenu state
    - Implement backdrop touch to close menu
    - Add LayoutAnimation for smooth transitions
    - _Requirements: 4.2, 10.2, 10.3_
  
  - [ ]* 6.2 Write property test for action menu interaction
    - **Property 5: Action Menu Interaction**
    - **Validates: Requirements 4.2**
  
  - [ ]* 6.3 Write property test for action menu conditional display
    - **Property 4: Action Menu Conditional Display**
    - **Validates: Requirements 4.1**
  
  - [ ]* 6.4 Write property test for auto-reminders menu text
    - **Property 6: Auto-Reminders Menu Text**
    - **Validates: Requirements 4.4**
  
  - [ ]* 6.5 Write property test for action menu backdrop dismissal
    - **Property 16: Action Menu Backdrop Dismissal**
    - **Validates: Requirements 10.3**

- [x] 7. Implement send reminder functionality
  - [x] 7.1 Implement email validation check
    - Check if invoice has recipient_email before sending
    - Show Alert.prompt if email is missing
    - Validate email format (contains @)
    - Update invoice with provided email before sending
    - _Requirements: 5.2, 5.3_
  
  - [x] 7.2 Implement reminder API call
    - Call `/api/documents/${invoiceId}/remind` endpoint
    - Handle success response with success alert
    - Handle error response with error alert
    - Close action menu after action
    - _Requirements: 5.1, 5.4, 5.5_
  
  - [ ]* 7.3 Write property test for send reminder email validation
    - **Property 7: Send Reminder Email Validation**
    - **Validates: Requirements 5.2**
  
  - [ ]* 7.4 Write property test for send reminder API call
    - **Property 8: Send Reminder API Call**
    - **Validates: Requirements 5.1, 5.3**

- [x] 8. Implement toggle reminders functionality
  - [x] 8.1 Implement toggle reminders API call
    - Get current reminders_enabled state (default true if undefined)
    - Call `/api/documents/${invoiceId}/toggle-reminders` with new state
    - Update selectedInvoice state with new reminders_enabled value
    - Show success/error alert based on response
    - Close action menu after action
    - _Requirements: 6.1, 6.4, 6.5_
  
  - [ ]* 8.2 Write property test for toggle reminders state change
    - **Property 9: Toggle Reminders State Change**
    - **Validates: Requirements 6.1**

- [x] 9. Implement delete functionality
  - [x] 9.1 Implement delete confirmation and API call
    - Show Alert.alert confirmation dialog when delete selected
    - Call `/api/documents/${invoiceId}` DELETE endpoint on confirm
    - Remove invoice from invoices state on success
    - Close modal on success
    - Show success/error alert based on response
    - Close action menu before showing confirmation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ]* 9.2 Write property test for delete confirmation flow
    - **Property 10: Delete Confirmation Flow**
    - **Validates: Requirements 7.1**
  
  - [ ]* 9.3 Write property test for successful deletion effects
    - **Property 11: Successful Deletion Effects**
    - **Validates: Requirements 7.2, 7.3, 7.4**

- [x] 10. Implement view invoice functionality
  - [x] 10.1 Implement browser opening with URL selection
    - Get URL from payment_link_url, blockradar_url, or construct from ID
    - Call WebBrowser.openBrowserAsync with selected URL
    - Use FULL_SCREEN presentation style with primary color controls
    - Wrap in try-catch and show error alert on failure
    - _Requirements: 8.2, 8.3, 8.4_
  
  - [ ]* 10.2 Write property test for view invoice URL selection
    - **Property 12: View Invoice URL Selection**
    - **Validates: Requirements 8.2, 8.3**

- [x] 11. Implement haptic feedback
  - [x] 11.1 Add haptic feedback to all interactive elements
    - Add Haptics.impactAsync to openModal (Medium)
    - Add Haptics.impactAsync to closeModal (Light)
    - Add Haptics.impactAsync to menu button toggle (Light)
    - Add Haptics.impactAsync to all action menu items (Medium)
    - Add Haptics.impactAsync to delete action (Heavy)
    - _Requirements: 10.1_
  
  - [ ]* 11.2 Write property test for haptic feedback on interactions
    - **Property 15: Haptic Feedback on Interactions**
    - **Validates: Requirements 10.1**

- [x] 12. Implement swipe-to-dismiss gesture
  - [x] 12.1 Configure SwiftUI BottomSheet dismiss gesture
    - Ensure SwiftUI BottomSheet has enablePanDownToClose equivalent
    - Verify onDismiss callback is called on swipe down
    - Test gesture works correctly on iOS
    - _Requirements: 10.4_
  
  - [ ]* 12.2 Write property test for swipe to dismiss modal
    - **Property 17: Swipe to Dismiss Modal**
    - **Validates: Requirements 10.4**

- [x] 13. Implement error handling and data validation
  - [x] 13.1 Add error handling for API calls
    - Wrap all fetch calls in try-catch blocks
    - Display user-friendly error messages in alerts
    - Log errors to console for debugging
    - _Requirements: 5.5, 6.5, 7.5, 8.4, 12.2_
  
  - [x] 13.2 Add graceful handling for missing invoice data
    - Use optional chaining for all invoice data access
    - Provide fallback values (e.g., 'N/A' for missing client name)
    - Handle missing URLs with constructed fallback
    - Ensure component doesn't crash with incomplete data
    - _Requirements: 12.4_
  
  - [ ]* 13.3 Write property test for API error feedback
    - **Property 13: API Error Feedback**
    - **Validates: Requirements 5.5, 6.5, 7.5, 8.4**
  
  - [ ]* 13.4 Write property test for graceful error handling
    - **Property 18: Graceful Error Handling for Invalid Data**
    - **Validates: Requirements 12.4**

- [ ] 14. Checkpoint - Verify all functionality works
  - Test all action menu options (send reminder, toggle reminders, delete)
  - Test view invoice button opens correct URL
  - Test haptic feedback on all interactions
  - Test error handling with network disconnected
  - Test with invoices missing various data fields
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Update implementation and cleanup
  - [x] 15.1 Keep @gorhom/bottom-sheet for Android fallback
    - Keep BottomSheetModal, BottomSheetView, BottomSheetBackdrop imports for fallback
    - Maintain dual implementation: SwiftUI for iOS, Gorhom for Android
    - Add comments explaining platform-specific implementations
    - _Requirements: 1.2, 11.2_
  
  - [x] 15.2 Update styling for SwiftUI compatibility
    - Verify all styles work correctly inside Host component
    - Adjust any styles that don't render properly
    - Ensure theme colors are applied correctly
    - _Requirements: 9.1, 9.2, 9.4_
  
  - [x] 15.3 Add code comments and documentation
    - Document SwiftUI import pattern
    - Document fallback strategy
    - Add comments explaining Host wrapper usage
    - Document any platform-specific considerations

- [ ]* 16. Write unit tests for edge cases
  - Test invoice ID formatting with various ID lengths
  - Test action menu items have correct icons and text
  - Test status badge colors for paid vs pending
  - Test email validation rejects invalid formats
  - Test URL construction when all URL fields are missing

- [ ] 17. Final checkpoint - Complete testing and validation
  - Run all unit tests and property tests
  - Test on iOS device/simulator with SwiftUI rendering
  - Test on Android device/emulator with fallback
  - Verify visual design matches existing app style
  - Verify smooth animations and transitions
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout the migration
- Property tests validate universal correctness properties across all invoice data
- Unit tests validate specific examples, edge cases, and integration points
- The migration is designed to be reversible - old code is removed only at the end
- SwiftUI components are beta, so error handling and fallbacks are critical
