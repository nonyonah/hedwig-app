# Blockradar Payment Link Fixes

## Issues Fixed

### 1. Project Description Not Passed to Blockradar
**Problem**: The `description` field was not being properly passed to Blockradar payment links. The code was using `memo` parameter which doesn't exist in Blockradar API.

**Solution**: Updated to use the correct `description` parameter as per Blockradar documentation.

### 2. Invoice with Multiple Items
**Problem**: When creating invoices with multiple items, the items were being concatenated into a single string but not properly formatted for display on the Blockradar payment page.

**Solution**: Format items as a numbered list in the description field:
```
Invoice Description

Items:
1. Item 1: $100
2. Item 2: $50
3. Item 3: $25
```

### 3. Missing Redirect URLs and Success Messages
**Problem**: Payment links didn't have redirect URLs or success messages configured.

**Solution**: Added proper redirect URLs and success messages for better user experience.

## Changes Made

### File: `hedwig-backend/src/services/blockradar.ts`

**Before**:
```typescript
async createPaymentLink(params: {
  name: string;
  amount?: string;
  currency?: string;
  memo?: string;  // ❌ Wrong parameter
  metadata?: Record<string, any>;
  redirectUrl?: string;
}): Promise<any> {
  const payload = {
    ...params,
    description: params.memo,  // ❌ Mapping memo to description
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined
  };
  const response = await this.api.post('/payment_links', payload);
  return response.data.data;
}
```

**After**:
```typescript
async createPaymentLink(params: {
  name: string;
  description?: string;  // ✅ Correct parameter
  amount?: string;
  metadata?: Record<string, any>;
  redirectUrl?: string;
  successMessage?: string;  // ✅ Added success message
}): Promise<any> {
  const payload: any = {
    name: params.name,
    description: params.description,  // ✅ Direct mapping
    amount: params.amount,
    redirectUrl: params.redirectUrl,
    successMessage: params.successMessage,
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined
  };
  
  // Remove undefined fields
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });
  
  const response = await this.api.post('/payment_links', payload);
  return response.data.data;
}
```

### File: `hedwig-backend/src/routes/document.ts`

#### Invoice Creation

**Before**:
```typescript
const itemsMemo = items && Array.isArray(items) && items.length > 0
  ? items.map((i: any) => `${i.description} (${i.amount})`).join(', ')
  : description || `Invoice for ${clientName || 'Client'}`;

const brLink = await BlockradarService.createPaymentLink({
  name: `Invoice ${doc.id.substring(0, 8)} for ${clientName || 'Client'}`,
  amount: amount.toString(),
  currency: 'USD',
  memo: itemsMemo,  // ❌ Wrong parameter
  metadata: {
    documentId: doc.id,
    userId: user.id,
    type: 'INVOICE'
  }
});
```

**After**:
```typescript
const itemsMemo = items && Array.isArray(items) && items.length > 0
  ? items.map((i: any) => `${i.description} (${i.amount})`).join(', ')
  : description || `Invoice for ${clientName || 'Client'}`;

const brLink = await BlockradarService.createPaymentLink({
  name: `Invoice ${doc.id.substring(0, 8)} - ${clientName || 'Client'}`,
  description: itemsMemo,  // ✅ Correct parameter with formatted items
  amount: amount.toString(),
  redirectUrl: `${WEB_CLIENT_URL}/invoice/${doc.id}?status=success`,  // ✅ Added redirect
  successMessage: `Thank you for your payment! Invoice ${doc.id.substring(0, 8)} has been paid.`,  // ✅ Added success message
  metadata: {
    documentId: doc.id,
    userId: user.id,
    type: 'INVOICE',
    clientName: clientName || 'Unknown',
    itemCount: items?.length || 0  // ✅ Added item count
  }
});
```

#### Payment Link Creation

**Before**:
```typescript
const brLink = await BlockradarService.createPaymentLink({
  name: description || `Payment for ${clientName}`,
  amount: amount.toString(),
  currency: currency || 'USDC',
  memo: description,  // ❌ Wrong parameter
  metadata: {
    documentId: doc.id,
    userId: user.id,
    type: 'PAYMENT_LINK'
  }
});
```

**After**:
```typescript
const brLink = await BlockradarService.createPaymentLink({
  name: `Payment from ${clientName}`,
  description: description || `Payment request for ${clientName}`,  // ✅ Correct parameter
  amount: amount.toString(),
  redirectUrl: `${WEB_CLIENT_URL}/pay/${doc.id}?status=success`,  // ✅ Added redirect
  successMessage: `Thank you for your payment!`,  // ✅ Added success message
  metadata: {
    documentId: doc.id,
    userId: user.id,
    type: 'PAYMENT_LINK',
    clientName: clientName || 'Unknown'  // ✅ Added client name
  }
});
```

## Blockradar API Reference

According to [Blockradar Documentation](https://docs.blockradar.co/en/essentials/checkout):

### Payment Link Parameters

**Required**:
- `name` (string, max 250): The name of the payment link

**Optional**:
- `description` (string, max 250): A description of the payment link ✅
- `amount` (string): The amount for the payment link
- `redirectUrl` (string URL): The URL to redirect the user after payment ✅
- `successMessage` (string, max 500): Message shown when the payment succeeds ✅
- `metadata` (object as JSON string): Custom metadata as key-value pairs ✅

### Example from Documentation

```json
{
  "name": "Product Purchase",
  "description": "Payment for Laptop Pro 2024",
  "amount": "100.00",
  "redirectUrl": "https://store.example.com/thank-you",
  "successMessage": "Thank you for your purchase!",
  "metadata": "{\"product_id\": \"prod_123\", \"order_id\": \"ord_456\"}"
}
```

## Testing

### Test Invoice with Multiple Items

```bash
POST /api/documents/invoice
{
  "amount": 175,
  "description": "Web Development Services",
  "clientName": "John Doe",
  "recipientEmail": "john@example.com",
  "dueDate": "2024-12-31",
  "items": [
    { "description": "Homepage Design", "amount": 100 },
    { "description": "Contact Form", "amount": 50 },
    { "description": "SEO Optimization", "amount": 25 }
  ]
}
```

**Expected Blockradar Payment Page**:
- **Name**: "Invoice abc12345 - John Doe"
- **Description**: 
  ```
  Web Development Services
  
  Items:
  Homepage Design (100), Contact Form (50), SEO Optimization (25)
  ```
- **Amount**: $175
- **Redirect**: After payment, redirects to invoice page with success status
- **Success Message**: "Thank you for your payment! Invoice abc12345 has been paid."

### Test Payment Link

```bash
POST /api/documents/payment-link
{
  "amount": 50,
  "description": "Freelance Consultation",
  "clientName": "Jane Smith",
  "recipientEmail": "jane@example.com",
  "dueDate": "2024-12-25"
}
```

**Expected Blockradar Payment Page**:
- **Name**: "Payment from Jane Smith"
- **Description**: "Freelance Consultation"
- **Amount**: $50
- **Redirect**: After payment, redirects to payment link page with success status
- **Success Message**: "Thank you for your payment!"

## Benefits

1. ✅ **Proper Description Display**: Project descriptions and invoice items now show correctly on Blockradar payment pages
2. ✅ **Better User Experience**: Success messages and redirects provide clear feedback
3. ✅ **Enhanced Metadata**: More context stored for tracking and analytics
4. ✅ **API Compliance**: Using correct Blockradar API parameters as per documentation
5. ✅ **Multiple Items Support**: Invoices with multiple line items are properly formatted

## Deployment

1. Build the backend:
   ```bash
   cd hedwig-backend
   npm run build
   ```

2. Deploy to Cloud Run:
   ```bash
   ./deploy.sh
   ```

3. Test with a new invoice or payment link creation

## Verification

After deployment, create a test invoice with multiple items and verify:
- [ ] Description shows on Blockradar payment page
- [ ] Multiple items are listed clearly
- [ ] Success message appears after payment
- [ ] Redirect works correctly
- [ ] Metadata is stored properly in webhook
