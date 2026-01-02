import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useExportWallet } from '@privy-io/react-auth/solana';
import { Wallet, ShieldCheck, Warning, SpinnerGap } from '@phosphor-icons/react';
import './ExportWalletPage.css';

type ChainType = 'ethereum' | 'solana';

export default function ExportWalletPage() {
    const [searchParams] = useSearchParams();
    const chainParam = searchParams.get('chain') as ChainType | null;
    const [selectedChain, setSelectedChain] = useState<ChainType>(chainParam || 'ethereum');
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Privy hooks
    const { ready, authenticated, user, login, exportWallet: exportEvmWallet } = usePrivy();
    const { exportWallet: exportSolanaWallet } = useExportWallet();

    // Find embedded wallets
    const evmWallet = user?.linkedAccounts?.find(
        (account: any) => account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === 'ethereum'
    );

    const solanaWallet = user?.linkedAccounts?.find(
        (account: any) => account.type === 'wallet' &&
            account.walletClientType === 'privy' &&
            account.chainType === 'solana'
    );

    const formatAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const handleExport = async () => {
        setError(null);
        setIsExporting(true);

        try {
            if (selectedChain === 'ethereum') {
                if (!evmWallet) {
                    throw new Error('No Ethereum wallet found');
                }
                await exportEvmWallet();
            } else {
                if (!solanaWallet) {
                    throw new Error('No Solana wallet found');
                }
                await exportSolanaWallet();
            }
        } catch (err: any) {
            console.error('Export error:', err);
            setError(err.message || 'Failed to export wallet');
        } finally {
            setIsExporting(false);
        }
    };

    // Show loading while Privy initializes
    if (!ready) {
        return (
            <div className="container">
                <div className="card loading-container">
                    <SpinnerGap size={48} className="spinner" />
                    <p>Loading...</p>
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

    // Authenticated view
    const currentWallet = selectedChain === 'ethereum' ? evmWallet : solanaWallet;
    const currentAddress = (currentWallet as any)?.address;

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

                {/* Wallet Info */}
                {currentAddress ? (
                    <div className="wallet-info">
                        <div className="wallet-label">Wallet Address</div>
                        <div className="wallet-address">{formatAddress(currentAddress)}</div>
                    </div>
                ) : (
                    <div className="wallet-info">
                        <div className="wallet-label">No {selectedChain} wallet found</div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="error-box">
                        <Warning size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Export Button */}
                <button
                    className="primary-button"
                    onClick={handleExport}
                    disabled={!currentAddress || isExporting}
                >
                    {isExporting ? (
                        <>
                            <SpinnerGap size={20} className="spinner" />
                            <span>Exporting...</span>
                        </>
                    ) : (
                        <>
                            <Wallet size={20} />
                            <span>Export Private Key</span>
                        </>
                    )}
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
