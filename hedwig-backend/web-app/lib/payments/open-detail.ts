'use client';

import { backendConfig } from '@/lib/auth/config';

export type PaymentDetailKind = 'invoice' | 'payment-link' | 'recurring';

export function openPaymentDetail(kind: PaymentDetailKind, id: string) {
  if (!id) return;
  switch (kind) {
    case 'invoice':
      window.open(`${backendConfig.appUrl}/invoice/${id}`, '_blank', 'noreferrer');
      break;
    case 'payment-link':
      window.open(`${backendConfig.appUrl}/pay/${id}`, '_blank', 'noreferrer');
      break;
    case 'recurring':
      window.location.href = `/payments?recurring=${id}`;
      break;
  }
}

