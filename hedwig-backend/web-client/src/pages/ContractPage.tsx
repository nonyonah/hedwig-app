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
    const approvalToken = searchParams.get('token');
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
        if (!id || !approvalToken) return;

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

    const formatCurrency = (amount: number | string) => {
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(num || 0);
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
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

    const freelancerName = contract.user
        ? `${contract.user.first_name || ''} ${contract.user.last_name || ''}`.trim() || 'Freelancer'
        : 'Freelancer';

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

                {/* Parties */}
                <div className="parties-section">
                    <div className="party-column">
                        <div className="party-label">Freelancer</div>
                        <div className="party-name">{freelancerName}</div>
                        <div className="party-email">{contract.user?.email}</div>
                    </div>
                    <div className="party-column">
                        <div className="party-label">Client</div>
                        <div className="party-name">{contract.content?.client_name || 'Client'}</div>
                        <div className="party-email">{contract.content?.client_email}</div>
                    </div>
                </div>

                {/* Contract Value */}
                {contract.content?.payment_amount && (
                    <div className="amount-section">
                        <div className="amount-label">Contract Value</div>
                        <div className="amount-value">{formatCurrency(contract.content.payment_amount)}</div>
                    </div>
                )}

                {/* Timeline */}
                <div className="details-section">
                    <div className="detail-row">
                        <span className="detail-label">Start Date</span>
                        <span className="detail-value">{formatDate(contract.content?.start_date)}</span>
                    </div>
                    <div className="detail-row">
                        <span className="detail-label">End Date</span>
                        <span className="detail-value">{formatDate(contract.content?.end_date)}</span>
                    </div>
                    {contract.content?.payment_terms && (
                        <div className="detail-row">
                            <span className="detail-label">Payment Terms</span>
                            <span className="detail-value">{contract.content.payment_terms}</span>
                        </div>
                    )}
                </div>

                {/* Scope of Work */}
                {contract.content?.scope_of_work && (
                    <div className="section">
                        <div className="section-title">Scope of Work</div>
                        <div className="section-content">{contract.content.scope_of_work}</div>
                    </div>
                )}

                {/* Deliverables */}
                {contract.content?.deliverables && contract.content.deliverables.length > 0 && (
                    <div className="section">
                        <div className="section-title">Deliverables</div>
                        <ul className="deliverables-list">
                            {contract.content.deliverables.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Milestones */}
                {contract.content?.milestones && contract.content.milestones.length > 0 && (
                    <div className="section">
                        <div className="section-title">Milestones</div>
                        <div className="milestones-list">
                            {contract.content.milestones.map((milestone, index) => (
                                <div key={index} className="milestone-item">
                                    <div className="milestone-header">
                                        <span className="milestone-number">{index + 1}</span>
                                        <span className="milestone-title">{milestone.title}</span>
                                        <span className="milestone-amount">{formatCurrency(milestone.amount)}</span>
                                    </div>
                                    {milestone.description && (
                                        <div className="milestone-description">{milestone.description}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Generated Contract Content */}
                {contract.content?.generated_content && (
                    <div className="section document-content">
                        <div
                            className="markdown-body"
                            dangerouslySetInnerHTML={{
                                __html: marked.parse(contract.content.generated_content) as string,
                            }}
                        />
                    </div>
                )}

                {/* Approval Section - Only show if has token and not yet approved */}
                {approvalToken && !isApproved && (
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
