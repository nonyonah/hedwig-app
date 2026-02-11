# Design Document: Invoice Modal SwiftUI Migration

## Overview

This design outlines the migration of the invoice modal from `@gorhom/bottom-sheet` to `@expo/ui/swift-ui` BottomSheet component. The migration will replace the third-party library with native iOS SwiftUI rendering while maintaining all existing functionality including invoice display, action menu, and user interactions.

The approach follows the existing patterns established in the codebase (as seen in `SwiftUIModalComponents.tsx` and `SwiftUIContextMenu.tsx`) where SwiftUI components are conditionally imported on iOS with React Native fallbacks for other platforms.

### Key Design Decisions

1. **State Management**: Replace imperative `present()`/`dismiss()` methods with declarative boolean state (`isModalOpen`)
2. **Component Wrapping**: Use `Host` component from Expo UI to wrap modal content for SwiftUI rendering
3. **Platform Strategy**: iOS uses native SwiftUI BottomSheet, Android continues using existing patterns or falls back to PlatformModal
4. **Incremental Migration**: Start with invoice modal only as a proof of concept before migrating other modals
5. **Error Resilience**: Graceful fallback if SwiftUI components fail to load

## Architecture

### Component Structure

```
InvoicesScreen
├── Invoice List (FlatList)
├── Profile Modal
└── Invoice Detail Modal (NEW: SwiftUI BottomSheet)
    ├── Host (Expo UI wrapper)
    │   ├── Modal Header
    │   │   ├── Status Icon & Badge
    │   │   ├── Title & Timestamp
    │   │   └── Action Menu Button
    │   ├── Action Menu (conditional)
    │   │   ├── Send Reminder
    │   │   ├── Toggle Auto-Reminders
    │   │   └── Delete
    │   ├── Amount Card
    │   ├── Details Card
    │   │   ├── Invoice ID
    │   │   ├── Description
    │   │   ├── Client Name
    │   │   └── Chain Info
    │   └── View Invoice Button
```

### State Management

**Current State (Gorhom)**:
```typescript
const bottomSheetRef = useRef<BottomSheetModal>(null);
// Open: bottomSheetRef.current?.present()
// Close: bottomSheetRef.current?.dismiss()
```

**New State (SwiftUI)**:
```typescript
const [isModalOpen, setIsModalOpen] = useState(false);
// Open: setIsModalOpen(true)
// Close: setIsModalOpen(false)
```

### Import Strategy

```typescript
// Conditional import pattern (iOS only)
let BottomSheet: any = null;
let Host: any = null;

if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        BottomSheet = SwiftUI.BottomSheet;
        Host = SwiftUI.Host;
    } catch (e) {
        console.warn('Failed to load @expo/ui/swift-ui:', e);
    }
}
```

## Components and Interfaces

### 1. SwiftUI BottomSheet Wrapper

**Purpose**: Conditionally render SwiftUI BottomSheet on iOS or fallback component on other platforms.

**Interface**:
```typescript
interface InvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: Invoice | null;
    onDelete: (id: string) => void;
    onSendReminder: (id: string) => Promise<void>;
    onToggleReminders: (id: string, enabled: boolean) => Promise<void>;
}
```

**Implementation Approach**:
- Check `Platform.OS === 'ios'` and SwiftUI components availability
- If available: Use `<BottomSheet isOpened={isOpen} onDismiss={onClose}>`
- If not available: Keep existing Gorhom BottomSheetModal as fallback (Android)
- Wrap content in `<Host>` component when using SwiftUI

### 2. Modal Header Component

**Purpose**: Display invoice status, timestamp, and action menu button.

**Structure**:
```typescript
<View style={styles.modalHeader}>
  <View style={styles.modalHeaderLeft}>
    <View style={styles.modalIconContainer}>
      <Image source={ICONS.usdc} />
      <Image source={statusIcon} style={styles.modalStatusBadge} />
    </View>
    <View>
      <Text>{status}</Text>
      <Text>{timestamp}</Text>
    </View>
  </View>
  <View style={styles.modalHeaderRight}>
    {status === 'Pending' && (
      <TouchableOpacity onPress={toggleActionMenu}>
        <DotsThree />
      </TouchableOpacity>
    )}
    <TouchableOpacity onPress={onClose}>
      <X />
    </TouchableOpacity>
  </View>
</View>
```

**Key Considerations**:
- Use React Native components inside Host (they render correctly)
- Apply haptic feedback on button presses
- Conditionally show menu button only for pending invoices

### 3. Action Menu Component

**Purpose**: Display pull-down menu with invoice actions.

**State**: `const [showActionMenu, setShowActionMenu] = useState(false)`

**Structure**:
```typescript
{showActionMenu && (
  <>
    <TouchableOpacity 
      style={styles.menuBackdrop} 
      onPress={() => setShowActionMenu(false)} 
    />
    <Animated.View style={styles.pullDownMenu}>
      <TouchableOpacity onPress={handleSendReminder}>
        <Bell /> Send Reminder
      </TouchableOpacity>
      <Divider />
      <TouchableOpacity onPress={handleToggleReminders}>
        <Bell /> {remindersEnabled ? 'Disable' : 'Enable'} Auto-Reminders
      </TouchableOpacity>
      <Divider />
      <TouchableOpacity onPress={handleDelete}>
        <Trash /> Delete
      </TouchableOpacity>
    </Animated.View>
  </>
)}
```

**Animation**: Use `LayoutAnimation` for smooth open/close transitions

### 4. Amount Card Component

**Purpose**: Display invoice amount in local currency and USDC.

**Structure**:
```typescript
<View style={styles.amountCard}>
  <Text style={styles.amountCardValue}>
    {formatCurrency(amount, currency)}
  </Text>
  <View style={styles.amountCardSub}>
    <Image source={ICONS.usdc} />
    <Text>{amount} USDC</Text>
  </View>
</View>
```

### 5. Details Card Component

**Purpose**: Display invoice metadata in a structured format.

**Structure**:
```typescript
<View style={styles.detailsCard}>
  <DetailRow label="Invoice ID" value={invoiceId} />
  <Divider />
  <DetailRow label="Description" value={description} />
  <Divider />
  <DetailRow label="Client" value={clientName} />
  <Divider />
  <DetailRow label="Chain" value={<ChainIcons />} />
</View>
```

### 6. View Invoice Button

**Purpose**: Open invoice payment link in browser.

**Implementation**:
```typescript
<TouchableOpacity 
  style={styles.viewButton}
  onPress={async () => {
    const url = invoice.payment_link_url || 
                invoice.content?.blockradar_url || 
                `${apiUrl}/invoice/${invoice.id}`;
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: Colors.primary,
    });
  }}
>
  <Text>View Invoice</Text>
</TouchableOpacity>
```

## Data Models

### Invoice Type

```typescript
interface Invoice {
  id: string;
  title: string;
  amount: number;
  status: 'PAID' | 'PENDING';
  created_at: string;
  payment_link_url?: string;
  content?: {
    due_date?: string;
    clientName?: string;
    client_name?: string;
    recipient_email?: string;
    reminders_enabled?: boolean;
    blockradar_url?: string;
  };
}
```

### Modal State

```typescript
interface ModalState {
  isModalOpen: boolean;
  selectedInvoice: Invoice | null;
  showActionMenu: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Modal Opens with Complete Invoice Data Display

*For any* invoice with valid data, when the modal is opened, all required invoice information (amount in both currencies, formatted invoice ID, status, title, client name, chain information, and timestamp) should be present in the rendered output.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

### Property 2: Platform-Specific Component Usage

*For any* invoice modal render on iOS with SwiftUI components available, the component tree should include the SwiftUI BottomSheet wrapped in a Host component; on Android or when SwiftUI is unavailable, a fallback component should be used instead.

**Validates: Requirements 1.1, 1.3, 1.4, 11.3, 11.4**

### Property 3: Modal State Transitions

*For any* invoice, tapping the invoice card should result in the modal becoming visible, and triggering the close action should result in the modal becoming hidden.

**Validates: Requirements 2.2, 2.3**

### Property 4: Action Menu Conditional Display

*For any* invoice with status "Pending", the modal should display the action menu button; for invoices with status "Paid", the menu button should not be displayed.

**Validates: Requirements 4.1**

### Property 5: Action Menu Interaction

*For any* pending invoice, tapping the action menu button should toggle the visibility of the action menu with all three options (Send Reminder, Toggle Auto-Reminders, Delete).

**Validates: Requirements 4.2**

### Property 6: Auto-Reminders Menu Text

*For any* invoice, the action menu should display "Disable Auto-Reminders" when reminders_enabled is true, and "Enable Auto-Reminders" when reminders_enabled is false.

**Validates: Requirements 4.4**

### Property 7: Send Reminder Email Validation

*For any* invoice without a recipient_email, selecting "Send Reminder" should prompt the user to enter an email address before attempting to send.

**Validates: Requirements 5.2**

### Property 8: Send Reminder API Call

*For any* invoice with a recipient_email, selecting "Send Reminder" should trigger an API call to the remind endpoint with the invoice ID.

**Validates: Requirements 5.1, 5.3**

### Property 9: Toggle Reminders State Change

*For any* invoice, selecting the toggle reminders option should trigger an API call that changes the reminders_enabled state to its opposite value.

**Validates: Requirements 6.1**

### Property 10: Delete Confirmation Flow

*For any* invoice, selecting "Delete" from the action menu should display a confirmation alert before proceeding with deletion.

**Validates: Requirements 7.1**

### Property 11: Successful Deletion Effects

*For any* invoice, when deletion succeeds, the invoice should be removed from the invoice list, the modal should close, and a success message should be displayed.

**Validates: Requirements 7.2, 7.3, 7.4**

### Property 12: View Invoice URL Selection

*For any* invoice, tapping "View Invoice" should attempt to open a browser with the URL from payment_link_url if present, otherwise blockradar_url if present, otherwise a constructed URL using the invoice ID.

**Validates: Requirements 8.2, 8.3**

### Property 13: API Error Feedback

*For any* failed API operation (send reminder, toggle reminders, delete, or browser open), an error message should be displayed to the user.

**Validates: Requirements 5.5, 6.5, 7.5, 8.4**

### Property 14: Visual Indicators Match Invoice State

*For any* invoice, the displayed status badge color should be green when status is "PAID" and yellow when status is "PENDING", and the appropriate token and chain icons should be present.

**Validates: Requirements 9.3, 9.5**

### Property 15: Haptic Feedback on Interactions

*For any* button press in the modal (menu button, close button, action menu items, view invoice button), the haptic feedback function should be called.

**Validates: Requirements 10.1**

### Property 16: Action Menu Backdrop Dismissal

*For any* open action menu, tapping the backdrop area outside the menu should close the action menu.

**Validates: Requirements 10.3**

### Property 17: Swipe to Dismiss Modal

*For any* open modal, performing a swipe-down gesture should close the modal.

**Validates: Requirements 10.4**

### Property 18: Graceful Error Handling for Invalid Data

*For any* invoice with missing or malformed data fields, the modal should render without crashing and display available information or appropriate placeholders.

**Validates: Requirements 12.4**

### Property 19: SwiftUI Component Loading Fallback

*For any* attempt to render the modal when SwiftUI components fail to load, the system should log a warning and render using fallback components without crashing.

**Validates: Requirements 12.1**

## Error Handling

### SwiftUI Component Loading Errors

**Strategy**: Try-catch around SwiftUI component imports with fallback to React Native components.

```typescript
let BottomSheet: any = null;
let Host: any = null;

if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        BottomSheet = SwiftUI.BottomSheet;
        Host = SwiftUI.Host;
    } catch (e) {
        console.warn('Failed to load @expo/ui/swift-ui, using fallback:', e);
        // Fallback will be handled in render logic
    }
}
```

**Fallback**: Keep existing Gorhom BottomSheetModal implementation when SwiftUI components are unavailable.

### API Errors

**Strategy**: Wrap all API calls in try-catch blocks with user-friendly error messages.

**Error Types**:
1. **Network Errors**: "Unable to connect. Please check your internet connection."
2. **Server Errors**: "Something went wrong. Please try again later."
3. **Validation Errors**: Display specific error message from API response

**Implementation Pattern**:
```typescript
try {
    const response = await fetch(url, options);
    const data = await response.json();
    if (data.success) {
        // Handle success
        Alert.alert('Success', successMessage);
    } else {
        Alert.alert('Error', data.error?.message || defaultErrorMessage);
    }
} catch (error) {
    console.error('API call failed:', error);
    Alert.alert('Error', 'Failed to complete action');
}
```

### Missing Invoice Data

**Strategy**: Use optional chaining and fallback values for all invoice data access.

**Examples**:
- `invoice?.content?.clientName || invoice?.content?.client_name || 'N/A'`
- `invoice?.payment_link_url || invoice?.content?.blockradar_url || constructedUrl`
- `invoice?.content?.reminders_enabled !== false` (default to true)

### Browser Opening Errors

**Strategy**: Catch WebBrowser errors and display the error message to the user.

```typescript
try {
    await WebBrowser.openBrowserAsync(url, options);
} catch (error: any) {
    Alert.alert('Error', `Failed to open: ${error?.message}`);
}
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
- Test that SwiftUI components are imported correctly on iOS
- Test that fallback components are used when SwiftUI is unavailable
- Test specific invoice data formatting (e.g., "INV-12345678" format)
- Test action menu items are rendered with correct icons and text
- Test API endpoint URLs are constructed correctly
- Test error alert messages match expected text

**Property-Based Tests**: Verify universal properties across all inputs
- Generate random invoice data and verify all required fields are displayed
- Generate invoices with various statuses and verify correct UI elements
- Generate invoices with/without emails and verify reminder flow
- Generate API success/failure responses and verify feedback
- Generate malformed invoice data and verify graceful handling

### Property-Based Testing Configuration

**Library**: Use `fast-check` for TypeScript/React Native property-based testing

**Configuration**: Each property test should run a minimum of 100 iterations to ensure comprehensive input coverage

**Test Tagging**: Each property-based test must include a comment referencing the design document property:
```typescript
// Feature: invoice-modal-swiftui-migration, Property 1: Modal Opens with Complete Invoice Data Display
```

### Test Organization

```
__tests__/
├── invoices/
│   ├── InvoiceModal.unit.test.tsx
│   │   ├── Component rendering tests
│   │   ├── SwiftUI import tests
│   │   ├── Fallback component tests
│   │   ├── Action menu rendering tests
│   │   └── Button interaction tests
│   │
│   └── InvoiceModal.property.test.tsx
│       ├── Property 1: Complete data display
│       ├── Property 2: Platform-specific components
│       ├── Property 3: Modal state transitions
│       ├── Property 7: Email validation
│       ├── Property 13: API error feedback
│       └── Property 18: Invalid data handling
```

### Key Testing Scenarios

**Unit Test Examples**:
1. Modal renders with SwiftUI BottomSheet on iOS
2. Modal renders with fallback on Android
3. Action menu shows correct items for pending invoice
4. Action menu hidden for paid invoice
5. Invoice ID formatted as "INV-XXXXXXXX"
6. Status badge shows green for paid, yellow for pending
7. View Invoice button opens correct URL

**Property Test Examples**:
1. For all invoices, modal displays all required fields
2. For all pending invoices, action menu is accessible
3. For all invoices without email, reminder prompts for email
4. For all API failures, error message is shown
5. For all malformed invoices, component doesn't crash

### Integration Testing

**Manual Testing Checklist**:
- [ ] Test on iOS device/simulator with SwiftUI rendering
- [ ] Test on Android device/emulator with fallback
- [ ] Test all action menu options (send reminder, toggle reminders, delete)
- [ ] Test with invoices missing various data fields
- [ ] Test with network disconnected (API errors)
- [ ] Test haptic feedback on all interactions
- [ ] Test swipe-to-dismiss gesture
- [ ] Test action menu backdrop dismissal
- [ ] Verify visual design matches existing app style
- [ ] Verify smooth animations and transitions

## Migration Steps

### Phase 1: Component Setup
1. Add conditional SwiftUI imports with error handling
2. Create boolean state for modal visibility
3. Replace BottomSheetModal with conditional SwiftUI BottomSheet

### Phase 2: Content Migration
1. Wrap modal content in Host component (iOS only)
2. Verify all React Native components render inside Host
3. Test touch handling for all interactive elements

### Phase 3: Testing and Refinement
1. Write unit tests for component rendering
2. Write property tests for data display and interactions
3. Test on iOS and Android devices
4. Fix any platform-specific issues

### Phase 4: Cleanup
1. Remove @gorhom/bottom-sheet imports from invoice screen
2. Update documentation
3. Prepare migration guide for other modals

## Platform Considerations

### iOS (SwiftUI)
- **Advantages**: Native feel, better performance, system-level animations
- **Considerations**: Beta API, potential breaking changes in future Expo UI updates
- **Fallback**: If SwiftUI fails, use PlatformModal

### Android
- **Strategy**: Continue using existing Gorhom BottomSheetModal implementation
- **Considerations**: Maintain feature parity with iOS, no changes needed for Android
- **Future**: Migrate to Expo UI Jetpack Compose when fully supported

### Testing Platforms
- **iOS**: Test on iOS 15+ (minimum SwiftUI support)
- **Android**: Test on Android 10+ (existing modal support)

## Dependencies

### Required Packages
- `@expo/ui` (~0.2.0-beta.9) - Already installed
- `expo-haptics` - Already in use
- `expo-web-browser` - Already in use

### No New Dependencies Required
All necessary packages are already installed in the project.

## Performance Considerations

### SwiftUI Rendering
- Native SwiftUI rendering should provide better performance than JavaScript-based bottom sheet
- Reduced JavaScript bridge overhead for animations

### Fallback Performance
- Fallback components should have similar performance to current implementation
- No performance regression expected on Android

### Memory Usage
- SwiftUI components may have lower memory footprint
- Monitor for any memory leaks during testing

## Future Enhancements

### After Successful Migration
1. Migrate other bottom sheets (project modal, milestone modal, etc.)
2. Create reusable SwiftUI modal wrapper component
3. Document best practices for SwiftUI integration
4. Consider migrating other UI components to SwiftUI

### Potential Improvements
1. Add SwiftUI animations for action menu
2. Use SwiftUI List for details card
3. Explore SwiftUI context menus for action menu
4. Add SwiftUI haptic feedback integration
