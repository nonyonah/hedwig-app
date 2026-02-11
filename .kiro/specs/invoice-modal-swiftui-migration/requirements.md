# Requirements Document

## Introduction

This feature migrates the invoice modal in `app/invoices/index.tsx` from using the third-party `@gorhom/bottom-sheet` library to using Expo UI's native SwiftUI BottomSheet component. This migration serves as a test case before migrating other bottom sheets in the application. The goal is to leverage native iOS SwiftUI rendering for better performance and native feel while maintaining all existing functionality.

## Glossary

- **Invoice_Modal**: The bottom sheet modal that displays detailed invoice information including amount, status, client info, and action buttons
- **BottomSheet**: A UI component that slides up from the bottom of the screen to display content
- **SwiftUI_BottomSheet**: The native iOS BottomSheet component from `@expo/ui/swift-ui`
- **Gorhom_BottomSheet**: The third-party bottom sheet library currently in use (`@gorhom/bottom-sheet`)
- **Host_Component**: The required wrapper component from Expo UI that enables SwiftUI rendering
- **Action_Menu**: The pull-down menu in the invoice modal that provides options for sending reminders, toggling auto-reminders, and deleting
- **Invoice_Details**: The information displayed in the modal including invoice ID, description, client name, chain, and amount
- **System**: The invoice modal component and its associated functionality

## Requirements

### Requirement 1: Replace Bottom Sheet Library

**User Story:** As a developer, I want to replace @gorhom/bottom-sheet with @expo/ui/swift-ui BottomSheet, so that the invoice modal uses native iOS SwiftUI rendering.

#### Acceptance Criteria

1. WHEN the invoice modal is rendered on iOS, THE System SHALL use the BottomSheet component from @expo/ui/swift-ui
2. THE System SHALL remove all imports and dependencies on @gorhom/bottom-sheet from the invoice screen
3. THE System SHALL wrap modal content in the Host component as required by Expo UI
4. WHERE the platform is Android, THE System SHALL continue using the existing Gorhom BottomSheetModal implementation

### Requirement 2: Maintain Modal State Management

**User Story:** As a developer, I want to manage the modal state using boolean values, so that it works with SwiftUI's declarative API.

#### Acceptance Criteria

1. WHEN managing modal visibility, THE System SHALL use a boolean state variable instead of imperative present/dismiss methods
2. WHEN a user taps an invoice card, THE System SHALL set the modal state to open
3. WHEN a user closes the modal, THE System SHALL set the modal state to closed
4. THE System SHALL properly handle the isOpened prop for the SwiftUI BottomSheet

### Requirement 3: Display Invoice Information

**User Story:** As a user, I want to view complete invoice details in the modal, so that I can review all relevant information.

#### Acceptance Criteria

1. WHEN the modal opens, THE System SHALL display the invoice amount in both local currency and USDC
2. WHEN the modal opens, THE System SHALL display the invoice ID in the format "INV-{first 8 characters uppercase}"
3. WHEN the modal opens, THE System SHALL display the invoice status (Paid or Pending) with appropriate visual indicators
4. WHEN the modal opens, THE System SHALL display the invoice description/title
5. WHEN the modal opens, THE System SHALL display the client name
6. WHEN the modal opens, THE System SHALL display the blockchain chain information (Multichain with Base and Solana icons)
7. WHEN the modal opens, THE System SHALL display the creation date and time

### Requirement 4: Action Menu Functionality

**User Story:** As a user, I want to access invoice actions through a menu, so that I can manage the invoice.

#### Acceptance Criteria

1. WHEN an invoice status is Pending, THE System SHALL display a three-dot menu button in the modal header
2. WHEN a user taps the menu button, THE System SHALL display the Action_Menu with available options
3. WHEN the Action_Menu is displayed, THE System SHALL show "Send Reminder" option with a bell icon
4. WHEN the Action_Menu is displayed, THE System SHALL show "Enable/Disable Auto-Reminders" option based on current state
5. WHEN the Action_Menu is displayed, THE System SHALL show "Delete" option in red with a trash icon
6. WHEN an invoice status is Paid, THE System SHALL not display the menu button

### Requirement 5: Send Reminder Action

**User Story:** As a user, I want to send payment reminders, so that I can follow up with clients on pending invoices.

#### Acceptance Criteria

1. WHEN a user selects "Send Reminder" and the invoice has a recipient email, THE System SHALL send a reminder to that email address
2. WHEN a user selects "Send Reminder" and the invoice lacks a recipient email, THE System SHALL prompt the user to enter an email address
3. WHEN the user provides a valid email address, THE System SHALL update the invoice with that email and send the reminder
4. WHEN the reminder is sent successfully, THE System SHALL display a success message
5. IF the reminder fails to send, THEN THE System SHALL display an error message

### Requirement 6: Toggle Auto-Reminders Action

**User Story:** As a user, I want to enable or disable automatic reminders, so that I can control follow-up communications.

#### Acceptance Criteria

1. WHEN a user selects the auto-reminders toggle option, THE System SHALL change the reminders_enabled state for that invoice
2. WHEN auto-reminders are enabled, THE System SHALL display "Disable Auto-Reminders" in the menu
3. WHEN auto-reminders are disabled, THE System SHALL display "Enable Auto-Reminders" in the menu
4. WHEN the toggle succeeds, THE System SHALL display a success message indicating the new state
5. IF the toggle fails, THEN THE System SHALL display an error message

### Requirement 7: Delete Invoice Action

**User Story:** As a user, I want to delete invoices, so that I can remove incorrect or unwanted entries.

#### Acceptance Criteria

1. WHEN a user selects "Delete" from the Action_Menu, THE System SHALL display a confirmation alert
2. WHEN the user confirms deletion, THE System SHALL remove the invoice from the backend
3. WHEN deletion succeeds, THE System SHALL remove the invoice from the list and close the modal
4. WHEN deletion succeeds, THE System SHALL display a success message
5. IF deletion fails, THEN THE System SHALL display an error message

### Requirement 8: View Invoice Button

**User Story:** As a user, I want to view the full invoice in a browser, so that I can see the complete payment page.

#### Acceptance Criteria

1. WHEN the modal is displayed, THE System SHALL show a "View Invoice" button at the bottom
2. WHEN a user taps "View Invoice", THE System SHALL open the invoice payment link in a browser
3. THE System SHALL use the stored payment_link_url or blockradar_url from the invoice data
4. IF the browser fails to open, THEN THE System SHALL display an error message

### Requirement 9: Visual Design and Theming

**User Story:** As a user, I want the modal to match the app's design system, so that the experience is consistent.

#### Acceptance Criteria

1. THE System SHALL apply theme colors from the app's theme system to all modal elements
2. THE System SHALL use the app's typography styles for all text elements
3. THE System SHALL display token icons (USDC) and chain icons (Base, Solana) with proper styling
4. THE System SHALL use rounded corners and appropriate spacing consistent with the app design
5. THE System SHALL display status badges with appropriate colors (green for Paid, yellow for Pending)

### Requirement 10: Touch Handling and Interactions

**User Story:** As a user, I want smooth and responsive interactions, so that the modal feels native and polished.

#### Acceptance Criteria

1. WHEN a user interacts with buttons in the modal, THE System SHALL provide haptic feedback
2. WHEN the Action_Menu opens or closes, THE System SHALL animate the transition smoothly
3. WHEN a user taps outside the Action_Menu, THE System SHALL close the menu
4. WHEN a user swipes down on the modal, THE System SHALL close the modal
5. THE System SHALL ensure all touchable elements inside the SwiftUI BottomSheet respond correctly to touch events

### Requirement 11: Platform Compatibility

**User Story:** As a developer, I want the feature to work across platforms, so that the app remains functional on all devices.

#### Acceptance Criteria

1. WHEN the app runs on iOS, THE System SHALL use the native SwiftUI BottomSheet
2. WHERE the app runs on Android, THE System SHALL continue using the existing Gorhom BottomSheetModal
3. THE System SHALL maintain feature parity between iOS and Android implementations
4. THE System SHALL handle the beta nature of @expo/ui gracefully with appropriate error handling

### Requirement 12: Error Handling

**User Story:** As a user, I want clear error messages when things go wrong, so that I understand what happened.

#### Acceptance Criteria

1. IF the SwiftUI components fail to load, THEN THE System SHALL log a warning and use fallback components
2. IF API calls fail (send reminder, toggle reminders, delete), THEN THE System SHALL display user-friendly error messages
3. IF the browser fails to open the invoice link, THEN THE System SHALL display an error with the failure reason
4. THE System SHALL handle missing or malformed invoice data gracefully without crashing
