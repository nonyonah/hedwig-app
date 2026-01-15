import { Wallet, ShieldCheck, Warning, Wrench } from '@phosphor-icons/react';
import './ExportWalletPage.css';

export default function ExportWalletPage() {
    return (
        <div className="container">
            <div className="card">
                <div className="header-icon" style={{ color: '#f59e0b' }}>
                    <Wrench size={64} weight="fill" />
                </div>
                <h1 className="title">Temporarily Unavailable</h1>
                <p className="subtitle">
                    Private key export is currently being upgraded. We're working hard to bring this feature back soon.
                </p>

                <div className="warning-box" style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
                    <Warning size={16} weight="fill" style={{ color: '#f59e0b' }} />
                    <span style={{ color: '#92400e' }}>
                        Your wallet and funds are safe. This is just a temporary maintenance.
                    </span>
                </div>

                <p style={{ fontSize: '14px', color: '#666', marginTop: '24px', textAlign: 'center' }}>
                    Please check back later or contact support if you need immediate assistance.
                </p>
            </div>
            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
