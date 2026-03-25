import { usePrivy } from '@privy-io/react-auth';
import { useExportWallet } from '@privy-io/react-auth/solana';
import { useState } from 'react';
import { Shield, Warning, Key, SpinnerGap, SignIn } from '../icons/lucide-icons';
import './ExportWalletPage.css';

type ChainType = 'ethereum' | 'solana';

export default function ExportWalletPage() {
    const { ready, authenticated, login, user, exportWallet: exportEthWallet } = usePrivy();
    const { exportWallet: exportSolWallet } = useExportWallet();
    const [selectedChain, setSelectedChain] = useState<ChainType>('ethereum');
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    // Loading state
    if (!ready) {
        return (
            <div className="container">
                <div className="card">
                    <div className="loading-container">
                        <SpinnerGap size={48} className="spinner" color="#7c3aed" />
                        <p>Loading...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Not authenticated — prompt login
    if (!authenticated) {
        return (
            <div className="container">
                <div className="card">
                    <div className="header-icon">
                        <SignIn size={64} weight="fill" />
                    </div>
                    <h1 className="title">Sign in to Export</h1>
                    <p className="subtitle">
                        You need to sign in to your Hedwig account to export your wallet's private key.
                    </p>
                    <button className="primary-button" onClick={login}>
                        <SignIn size={20} weight="bold" />
                        Sign In
                    </button>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    // Check wallet availability
    const hasEthWallet = !!user?.linkedAccounts.find(
        (account) =>
            account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === 'ethereum'
    );
    const hasSolWallet = !!user?.linkedAccounts.find(
        (account) =>
            account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === 'solana'
    );

    const handleExport = async () => {
        setError(null);
        setExporting(true);
        try {
            if (selectedChain === 'ethereum') {
                await exportEthWallet();
            } else {
                await exportSolWallet();
            }
        } catch (err: any) {
            console.error('Export failed:', err);
            setError(err?.message || 'Failed to export wallet. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const currentWalletAvailable = selectedChain === 'ethereum' ? hasEthWallet : hasSolWallet;

    // Get the wallet address for display
    const walletAddress = user?.linkedAccounts.find(
        (account) =>
            account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === selectedChain
    );
    const address = walletAddress && 'address' in walletAddress ? (walletAddress as any).address : null;
    const truncatedAddress = address
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : 'Not available';

    return (
        <div className="container">
            <div className="card">
                <div className="header-icon">
                    <Key size={64} weight="fill" />
                </div>
                <h1 className="title">Export Private Key</h1>
                <p className="subtitle">
                    Select a chain and export your embedded wallet's private key. Keep it safe!
                </p>

                {/* Chain selector */}
                <div className="chain-selector">
                    <button
                        className={`chain-button ${selectedChain === 'ethereum' ? 'active' : ''}`}
                        onClick={() => setSelectedChain('ethereum')}
                    >
                        <span className="chain-icon eth">⟠</span>
                        Ethereum
                    </button>
                    <button
                        className={`chain-button ${selectedChain === 'solana' ? 'active' : ''}`}
                        onClick={() => setSelectedChain('solana')}
                    >
                        <span className="chain-icon sol">◎</span>
                        Solana
                    </button>
                </div>

                {/* Wallet info */}
                {currentWalletAvailable && (
                    <div className="wallet-info">
                        <div className="wallet-label">{selectedChain === 'ethereum' ? 'EVM' : 'Solana'} Wallet</div>
                        <div className="wallet-address">{truncatedAddress}</div>
                    </div>
                )}

                {/* Error display */}
                {error && (
                    <div className="error-box">
                        <Warning size={16} weight="fill" />
                        {error}
                    </div>
                )}

                {/* Export button */}
                <button
                    className="primary-button"
                    onClick={handleExport}
                    disabled={!currentWalletAvailable || exporting}
                >
                    {exporting ? (
                        <>
                            <SpinnerGap size={20} className="spinner" />
                            Exporting...
                        </>
                    ) : !currentWalletAvailable ? (
                        <>
                            <Warning size={20} weight="fill" />
                            No {selectedChain === 'ethereum' ? 'EVM' : 'Solana'} wallet found
                        </>
                    ) : (
                        <>
                            <Shield size={20} weight="fill" />
                            Export Private Key
                        </>
                    )}
                </button>

                {/* Security warning */}
                <div className="warning-box">
                    <Warning size={16} weight="fill" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                        Never share your private key with anyone. Anyone with your key has full access to your funds.
                    </span>
                </div>
            </div>
            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
