import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight } from '@phosphor-icons/react';
import './PaymentLinkPage.css'; // Reuse existing styles

export default function SuccessPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const txHash = searchParams.get('txHash');
    const amount = searchParams.get('amount');
    const symbol = searchParams.get('symbol');

    return (
        <div className="page-container">
            <div className="payment-card success-card">
                <CheckCircle size={80} weight="fill" className="success-icon" />
                <h2 className="success-title">Payment Successful!</h2>

                {amount && (
                    <p className="success-amount">
                        {amount} {symbol || ''}
                    </p>
                )}

                <p className="success-message">
                    Your payment has been processed successfully.
                    {txHash && <br />}
                    {txHash && (
                        <span style={{ fontSize: '12px', color: '#666', display: 'block', marginTop: '8px' }}>
                            Ref: {txHash.slice(0, 8)}...{txHash.slice(-8)}
                        </span>
                    )}
                </p>

                <button
                    className="pay-button" // Reuse styles
                    onClick={() => window.location.href = 'https://hedwig.money'} // Fallback to landing or app link
                    style={{ marginTop: '24px' }}
                >
                    <span>Back to Hedwig</span>
                </button>
            </div>
            <div className="footer">Secured by Hedwig</div>
        </div>
    );
}
