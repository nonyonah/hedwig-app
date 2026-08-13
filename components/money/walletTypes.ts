import type { OnrampOrder } from '../../hooks/useOnramp';
import type { CoinbasePayActivitySession } from '../../hooks/useCoinbasePay';
import type { UsdTransfer } from '../../app/wallet/usdAccountApi';

export interface Transaction {
    id: string;
    type: 'IN' | 'OUT';
    description: string;
    amount: string;
    token: string;
    date: string;
    hash: string;
    network: 'base' | 'solana' | 'optimism' | 'arbitrum' | 'polygon' | 'celo';
    status: 'completed' | 'pending' | 'failed';
    from: string;
    to: string;
}

export interface OfframpOrder {
    id: string;
    providerOrderId?: string;
    paycrestOrderId?: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    chain: string;
    token: string;
    cryptoAmount: number;
    fiatCurrency: string;
    fiatAmount: number;
    exchangeRate: number;
    serviceFee: number;
    bankName: string;
    accountNumber: string;
    accountName: string;
    txHash?: string;
    createdAt: string;
    completedAt?: string;
}

export type ActivityItem =
    | { kind: 'tx';         data: Transaction  }
    | { kind: 'withdrawal'; data: OfframpOrder }
    | { kind: 'onramp';     data: OnrampOrder  }
    | { kind: 'coinbase';   data: CoinbasePayActivitySession }
    | { kind: 'usd';        data: UsdTransfer };

export type ActivityFilter = 'all' | 'in' | 'out' | 'withdrawals' | 'onramps' | 'failed';
export type NetworkFilter = 'all' | 'base' | 'solana' | 'arbitrum' | 'polygon' | 'optimism' | 'celo';