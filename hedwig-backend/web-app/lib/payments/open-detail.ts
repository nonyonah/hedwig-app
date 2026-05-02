'use client';

export type PaymentDetailKind = 'invoice' | 'payment-link' | 'recurring';

export function openPaymentDetail(kind: PaymentDetailKind, id: string) {
  if (!id) return;
  window.dispatchEvent(
    new CustomEvent('hedwig:open-payment-detail', {
      detail: { kind, id },
    })
  );
}

