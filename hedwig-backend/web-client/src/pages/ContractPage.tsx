import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, DownloadSimple, FileText, PaperPlaneTilt, Printer } from '@phosphor-icons/react';
import { marked } from 'marked';
import './ContractPage.css';

interface Milestone {
    title: string;
    amount: number | string;
    description?: string;
}

interface ContractData {
    id: string;
    title: string;
    status: string;
    created_at: string;
    content?: {
        client_name?: string;
        client_email?: string;
        scope_of_work?: string;
        deliverables?: string[];
        milestones?: Milestone[];
        payment_amount?: number | string;
        payment_terms?: string;
        start_date?: string;
        end_date?: string;
        generated_content?: string;
        approval_token?: string;
    };
    user?: {
        first_name?: string;
        last_name?: string;
        email?: string;
    };
}

export default function ContractPage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const urlToken = searchParams.get('token');
    const approved = searchParams.get('approved');

    const [contract, setContract] = useState<ContractData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isApproving, setIsApproving] = useState(false);
    const [showApprovalSuccess, setShowApprovalSuccess] = useState(approved === 'true');

    // Fetch contract data
    useEffect(() => {
        const fetchContract = async () => {
            if (!id) return;

            try {
                setLoading(true);
                const apiUrl = import.meta.env.VITE_API_URL || '';
                const response = await fetch(`${apiUrl}/api/documents/${id}`);

                if (!response.ok) {
                    throw new Error('Contract not found');
                }

                const data = await response.json();
                const doc = data.data?.document || data.data || data;
                setContract(doc);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load contract');
            } finally {
                setLoading(false);
            }
        };

        fetchContract();
    }, [id]);

    const handleApprove = async () => {
        // Get token from URL or from contract content
        const approvalToken = urlToken || contract?.content?.approval_token;
        if (!id || !approvalToken) {
            alert('No approval token found');
            return;
        }

        setIsApproving(true);
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const response = await fetch(`${apiUrl}/api/documents/approve/${id}/${approvalToken}`);

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || 'Approval failed');
            }

            setShowApprovalSuccess(true);
            // Reload contract to get updated status
            const contractResponse = await fetch(`${apiUrl}/api/documents/${id}`);
            const data = await contractResponse.json();
            const doc = data.data?.document || data.data || data;
            setContract(doc);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to approve contract');
        } finally {
            setIsApproving(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const getStatusLabel = (status: string) => {
        switch (status.toUpperCase()) {
            case 'DRAFT':
                return 'Draft';
            case 'SENT':
                return 'Awaiting Approval';
            case 'APPROVED':
            case 'SIGNED':
                return 'Approved';
            case 'COMPLETED':
            case 'PAID':
                return 'Completed';
            default:
                return status;
        }
    };

    const isApproved = ['APPROVED', 'SIGNED', 'COMPLETED', 'PAID'].includes(contract?.status?.toUpperCase() || '');

    if (loading) {
        return (
            <div className="contract-container">
                <div className="contract-card loading-container">
                    <div className="spinner" />
                    <p>Loading contract...</p>
                </div>
            </div>
        );
    }

    if (error || !contract) {
        return (
            <div className="contract-container">
                <div className="contract-card error-container">
                    <div className="error-title">Contract Not Found</div>
                    <p className="error-message">{error || 'The contract you are looking for does not exist.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="contract-container">
            {/* Approval Success Banner */}
            {showApprovalSuccess && (
                <div className="approval-banner">
                    <CheckCircle size={24} weight="fill" />
                    <span>Contract has been approved successfully!</span>
                </div>
            )}

            <div className="contract-card">
                {/* Header */}
                <div className="contract-header">
                    <div className="contract-header-left">
                        <FileText size={32} weight="fill" className="contract-icon" />
                        <div>
                            <div className="contract-number">CONTRACT-{contract.id.slice(4, 12).toUpperCase()}</div>
                            <div className="contract-title">{contract.title}</div>
                        </div>
                    </div>
                    <div className="contract-header-right">
                        <span className={`status-badge ${contract.status.toLowerCase()}`}>
                            {getStatusLabel(contract.status)}
                        </span>
                        <button className="icon-button no-print" onClick={handlePrint} title="Print">
                            <Printer size={20} />
                        </button>
                        <button className="icon-button no-print" title="Download">
                            <DownloadSimple size={20} />
                        </button>
                    </div>
                </div>

                {/* Generated Contract Content - This is the main content */}
                {contract.content?.generated_content && (
                    <div className="document-content">
                        <div
                            className="markdown-body"
                            dangerouslySetInnerHTML={{
                                __html: marked.parse(contract.content.generated_content) as string,
                            }}
                        />
                    </div>
                )}

                {/* Approval Section - Show if has token (from URL or content) and not yet approved */}
                {!isApproved && (urlToken || contract.content?.approval_token) && (
                    <div className="approval-section no-print">
                        <button
                            className="approve-button"
                            onClick={handleApprove}
                            disabled={isApproving}
                        >
                            <PaperPlaneTilt size={20} weight="fill" />
                            <span>{isApproving ? 'Approving...' : 'Approve Contract'}</span>
                        </button>
                        <p className="approval-note">
                            By clicking "Approve Contract", you agree to the terms outlined above.
                        </p>
                    </div>
                )}

                {/* Already Approved */}
                {isApproved && (
                    <div className="approved-section">
                        <CheckCircle size={24} weight="fill" className="approved-icon" />
                        <span>This contract has been approved</span>
                    </div>
                )}
            </div>

            <div className="footer no-print">Secured by Hedwig</div>
        </div>
    );
}
