import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import './FeedbackPage.css';

export default function FeedbackPage() {
    const [searchParams] = useSearchParams();

    // Get user info from URL params (passed from mobile app)
    const userId = searchParams.get('userId') || '';
    const email = searchParams.get('email') || '';
    const firstName = searchParams.get('firstName') || '';
    const lastName = searchParams.get('lastName') || '';

    useEffect(() => {
        // Load UserJot SDK using a simple script tag approach
        const loadUserJot = () => {
            const projectId = import.meta.env.VITE_USERJOT_PROJECT_ID;

            if (!projectId) {
                console.error('VITE_USERJOT_PROJECT_ID not configured');
                return;
            }

            // Create and inject the UserJot script
            (window as any).$ujq = (window as any).$ujq || [];
            (window as any).uj = (window as any).uj || new Proxy({}, {
                get: (_: any, p: string) => (...a: any[]) => (window as any).$ujq.push([p, ...a])
            });

            const script = document.createElement('script');
            script.src = 'https://cdn.userjot.com/sdk/v2/uj.js';
            script.type = 'module';
            script.async = true;
            document.head.appendChild(script);

            // Initialize after script loads
            script.onload = () => {
                // Initialize UserJot
                (window as any).uj.init(projectId, { widget: true });

                // Identify user if we have their info
                if (userId && email) {
                    (window as any).uj.identify({
                        id: userId,
                        email: email,
                        firstName: firstName || undefined,
                        lastName: lastName || undefined,
                    });
                }

                // Auto-open after a short delay
                setTimeout(() => {
                    (window as any).uj.open();
                }, 800);
            };
        };

        loadUserJot();
    }, [userId, email, firstName, lastName]);

    return (
        <div className="feedback-container">
            <div className="feedback-content">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Opening feedback...</p>
                </div>
            </div>
        </div>
    );
}
