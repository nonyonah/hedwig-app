import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePrivy, type WalletWithMetadata } from '@privy-io/react-auth';
import { useExportWallet } from '@privy-io/react-auth/solana';
import { Wallet, ShieldCheck, Warning, SpinnerGap } from '@phosphor-icons/react';
import './ExportWalletPage.css';

type ChainType = 'ethereum' | 'solana';

export default function ExportWalletPage() {
    const [searchParams] = useSearchParams();
    const chainParam = searchParams.get('chain') as ChainType | null;
    const [selectedChain, setSelectedChain] = useState<ChainType>(chainParam || 'ethereum');
    const [loadingTimeout, setLoadingTimeout] = useState(false);

    // Privy hooks - using native exportWallet functions
    const { ready, authenticated, user, login, exportWallet: exportEvmWallet } = usePrivy();
    const { exportWallet: exportSolanaWallet } = useExportWallet();

    // Detect loading timeout
    useEffect(() => {
        if (!ready) {
            const timer = setTimeout(() => {
                setLoadingTimeout(true);
            }, 10000); // 10 second timeout
            return () => clearTimeout(timer);
        }
    }, [ready]);

    // Check that user is authenticated
    const isAuthenticated = ready && authenticated;

    // Find embedded wallets and get their addresses
    const evmWallet = user?.linkedAccounts?.find(
        (account): account is WalletWithMetadata =>
            account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === 'ethereum'
    );

    const solanaWallet = user?.linkedAccounts?.find(
        (account): account is WalletWithMetadata =>
            account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === 'solana'
    );

    const hasEvmWallet = !!evmWallet;
    const hasSolanaWallet = !!solanaWallet;

    // Show loading while Privy initializes
    if (!ready) {
        return (
            <div className="container">
                <div className="card loading-container">
                    <SpinnerGap size={48} className="spinner" />
                    {loadingTimeout ? (
                        <>
                            <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: '8px' }}>Loading is taking too long</p>
                            <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
                                There may be a connection issue. Please try refreshing the page.
                            </p>
                            <button
                                className="primary-button"
                                onClick={() => window.location.reload()}
                                style={{ maxWidth: '200px' }}
                            >
                                Refresh Page
                            </button>
                        </>
                    ) : (
                        <p>Loading...</p>
                    )}
                </div>
            </div>
        );
    }

    // Show login if not authenticated
    if (!authenticated) {
        return (
            <div className="container">
                <div className="card">
                    <div className="header-icon">
                        <ShieldCheck size={64} weight="fill" />
                    </div>
                    <h1 className="title">Export Private Key</h1>
                    <p className="subtitle">
                        Sign in to your Hedwig account to export your wallet's private key.
                    </p>
                    <button className="primary-button" onClick={login}>
                        <Wallet size={20} />
                        <span>Sign In with Hedwig</span>
                    </button>
                </div>
                <div className="footer">Secured by Hedwig</div>
            </div>
        );
    }

    // Get current wallet status
    const hasCurrentWallet = selectedChain === 'ethereum' ? hasEvmWallet : hasSolanaWallet;

    // Handle export with proper address parameter
    const handleExport = () => {
        if (selectedChain === 'ethereum' && evmWallet?.address) {
            exportEvmWallet({ address: evmWallet.address });
        } else if (selectedChain === 'solana' && solanaWallet?.address) {
            exportSolanaWallet({ address: solanaWallet.address });
        }
    };

    return (
        <div className="container">
            <div className="card">
                <div className="header-icon success">
                    <ShieldCheck size={64} weight="fill" />
                </div>
                <h1 className="title">Export Private Key</h1>
                <p className="subtitle">
                    Your private key gives full access to your wallet. Keep it secure.
                </p>

                {/* Chain Selector */}
                <div className="chain-selector">
                    <button
                        className={`chain-button ${selectedChain === 'ethereum' ? 'active' : ''}`}
                        onClick={() => setSelectedChain('ethereum')}
                    >
                        <span className="chain-icon eth">Ξ</span>
                        <span>Ethereum</span>
                    </button>
                    <button
                        className={`chain-button ${selectedChain === 'solana' ? 'active' : ''}`}
                        onClick={() => setSelectedChain('solana')}
                    >
                        <span className="chain-icon sol">◎</span>
                        <span>Solana</span>
                    </button>
                </div>

                {/* Wallet Status */}
                <div className="wallet-info">
                    {hasCurrentWallet ? (
                        <div className="wallet-label" style={{ color: '#10b981' }}>
                            ✓ {selectedChain === 'ethereum' ? 'Ethereum' : 'Solana'} wallet found
                        </div>
                    ) : (
                        <div className="wallet-label" style={{ color: '#ef4444' }}>
                            No {selectedChain} wallet found
                        </div>
                    )}
                </div>

                {/* Export Button - Uses native Privy modal */}
                <button
                    className="primary-button"
                    onClick={handleExport}
                    disabled={!isAuthenticated || !hasCurrentWallet}
                >
                    <Wallet size={20} />
                    <span>Export Private Key</span>
                </button>

                {/* Warning */}
                <div className="warning-box">
                    <Warning size={16} weight="fill" />
                    <span>Never share your private key with anyone. Anyone with this key can access your funds.</span>
                </div>
            </div>
            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
