import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './FeedbackPage.css';

declare global {
    interface Window {
        uj: {
            init: (projectId: string, options?: { widget?: boolean }) => void;
            identify: (user: { id: string; email: string; firstName?: string; lastName?: string; avatar?: string } | null) => void;
            open: () => void;
        };
    }
}

export default function FeedbackPage() {
    const [searchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);

    // Get user info from URL params (passed from mobile app)
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');
    const firstName = searchParams.get('firstName');
    const lastName = searchParams.get('lastName');

    useEffect(() => {
        // Load UserJot SDK
        const script = document.createElement('script');
        script.innerHTML = `window.$ujq=window.$ujq||[];window.uj=window.uj||new Proxy({},{get:(_,p)=>(...a)=>window.$ujq.push([p,...a])});document.head.appendChild(Object.assign(document.createElement('script'),{src:'https://cdn.userjot.com/sdk/v2/uj.js',type:'module',async:!0}));`;
        document.head.appendChild(script);

        // Initialize after a short delay
        const initTimer = setTimeout(() => {
            // Get project ID from env
            const projectId = import.meta.env.VITE_USERJOT_PROJECT_ID || '';

            if (!projectId) {
                console.error('VITE_USERJOT_PROJECT_ID not configured');
                setIsLoading(false);
                return;
            }

            // Initialize UserJot
            window.uj.init(projectId, { widget: false });

            // Identify user if we have their info
            if (userId && email) {
                window.uj.identify({
                    id: userId,
                    email: email,
                    firstName: firstName || undefined,
                    lastName: lastName || undefined,
                });
            }

            setIsLoading(false);
            setIsReady(true);

            // Auto-open the feedback widget
            setTimeout(() => {
                window.uj.open();
            }, 500);
        }, 1000);

        return () => clearTimeout(initTimer);
    }, [userId, email, firstName, lastName]);

    return (
        <div className="feedback-container">
            <div className="feedback-content">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading feedback...</p>
                    </div>
                ) : isReady ? (
                    <div className="ready-state">
                        <h1>Share Your Feedback</h1>
                        <p>The feedback widget should open automatically.</p>
                        <button
                            className="open-button"
                            onClick={() => window.uj.open()}
                        >
                            Open Feedback
                        </button>
                    </div>
                ) : (
                    <div className="error-state">
                        <h1>Feedback Unavailable</h1>
                        <p>Please try again later.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
