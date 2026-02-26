// TypeScript declarations for Solana wallet (Phantom, Solflare, etc.)
interface SolanaWallet {
    publicKey: {
        toString(): string;
    };
    connect(): Promise<{ publicKey: { toString(): string } }>;
    disconnect(): Promise<void>;
    signAndSendTransaction(transaction: any): Promise<{ signature: string }>;
    signTransaction(transaction: any): Promise<any>;
    signAllTransactions(transactions: any[]): Promise<any[]>;
    isConnected: boolean;
    isPhantom?: boolean;
    isSolflare?: boolean;
}

interface Window {
    solana?: SolanaWallet;
    phantom?: {
        solana?: SolanaWallet;
    };
    solflare?: SolanaWallet;
}
