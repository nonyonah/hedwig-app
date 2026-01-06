import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/expo';
import { Colors } from '../theme/colors';

// Insight & Data Interfaces
export interface Insight {
    id: string;
    type: 'earnings' | 'client' | 'invoice' | 'deadline' | 'generic';
    title: string;
    description: string;
    icon: string; // SF Symbol name or emoji
    value?: string;
    trend?: 'up' | 'down' | 'neutral';
    actionLabel?: string;
    actionRoute?: string;
    priority: number; // Higher number = show first
    color?: string;
}

export interface MonthlyStats {
    month: string;
    earnings: number;
    currency: string;
    changePercentage: number;
}

export interface ClientStats {
    id: string;
    name: string;
    totalRevenue: number;
    projectCount: number;
}

interface Document {
    id: string;
    type: 'INVOICE' | 'PAYMENT_LINK' | 'CONTRACT';
    title: string;
    amount: number;
    status: string;
    created_at: string;
    content?: {
        clientName?: string;
        client_name?: string;
    };
}

export function useInsights() {
    const [insights, setInsights] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(true);
    const { getAccessToken } = usePrivy();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) {
                setLoading(false);
                return;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Fetch invoices and payment links in parallel
            const [invoicesRes, linksRes] = await Promise.all([
                fetch(`${apiUrl}/api/documents?type=INVOICE`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            const invoicesData = await invoicesRes.json();
            const linksData = await linksRes.json();

            const invoices: Document[] = invoicesData.success ? invoicesData.data.documents : [];
            const links: Document[] = linksData.success ? linksData.data.documents : [];
            const allDocs = [...invoices, ...links];

            const newInsights: Insight[] = [];
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });

            // Calculate monthly earnings from paid documents
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            
            const paidThisMonth = allDocs.filter(doc => 
                doc.status === 'PAID' && 
                new Date(doc.created_at) >= startOfMonth
            );
            const monthlyEarnings = paidThisMonth.reduce((sum, doc) => {
                const amount = typeof doc.amount === 'number' ? doc.amount : parseFloat(String(doc.amount).replace(/[^0-9.]/g, '')) || 0;
                return sum + amount;
            }, 0);

            // Calculate last month earnings for comparison
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            const paidLastMonth = allDocs.filter(doc => 
                doc.status === 'PAID' && 
                new Date(doc.created_at) >= startOfLastMonth &&
                new Date(doc.created_at) <= endOfLastMonth
            );
            const lastMonthEarnings = paidLastMonth.reduce((sum, doc) => {
                const amount = typeof doc.amount === 'number' ? doc.amount : parseFloat(String(doc.amount).replace(/[^0-9.]/g, '')) || 0;
                return sum + amount;
            }, 0);

            const earningsChange = lastMonthEarnings > 0 
                ? ((monthlyEarnings - lastMonthEarnings) / lastMonthEarnings * 100).toFixed(0)
                : monthlyEarnings > 0 ? '+100' : '0';
            
            const earningsTrend: 'up' | 'down' | 'neutral' = 
                monthlyEarnings > lastMonthEarnings ? 'up' : 
                monthlyEarnings < lastMonthEarnings ? 'down' : 'neutral';

            newInsights.push({
                id: 'earnings-1',
                type: 'earnings',
                title: 'Monthly Earnings',
                description: `You've earned $${monthlyEarnings.toLocaleString()} in ${currentMonth}.`,
                value: `$${monthlyEarnings.toLocaleString()}`,
                icon: 'chart.bar.fill', // SF Symbol
                trend: earningsTrend,
                priority: 10,
                color: Colors.success,
            });

            // Outstanding Invoices Check
            const unpaid = allDocs.filter(doc => 
                (doc.status === 'SENT' || doc.status === 'VIEWED' || doc.status === 'PENDING')
            );
            const overdue = unpaid.filter(doc => {
                // Assume 30 days as default due period if no dueDate
                const createdDate = new Date(doc.created_at);
                const dueDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                return dueDate < new Date();
            });

            if (unpaid.length > 0) {
                const totalUnpaid = unpaid.reduce((sum, doc) => {
                    const amount = typeof doc.amount === 'number' ? doc.amount : parseFloat(String(doc.amount).replace(/[^0-9.]/g, '')) || 0;
                    return sum + amount;
                }, 0);
                const isUrgent = overdue.length > 0;

                newInsights.push({
                    id: 'invoices-1',
                    type: 'invoice',
                    title: isUrgent ? 'Action Required' : 'Outstanding Invoices',
                    description: isUrgent
                        ? `You have ${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''}. Total pending: $${totalUnpaid.toLocaleString()}`
                        : `${unpaid.length} invoices are pending payment totaling $${totalUnpaid.toLocaleString()}.`,
                    value: `$${totalUnpaid.toLocaleString()}`,
                    icon: isUrgent ? 'exclamationmark.circle.fill' : 'clock.fill',
                    priority: isUrgent ? 20 : 5, // High priority if overdue
                    color: isUrgent ? Colors.error : Colors.warning,
                    actionLabel: 'View Invoices',
                    actionRoute: '/invoices',
                });
            }

            // Top Client Analysis - fetch from clients API for accurate data
            try {
                const clientsRes = await fetch(`${apiUrl}/api/clients`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (clientsRes.ok) {
                    const clientsData = await clientsRes.json();
                    if (clientsData.success && clientsData.data?.clients) {
                        const clients = clientsData.data.clients;
                        // Sort by totalEarnings to find top client
                        const sortedClients = [...clients]
                            .filter((c: any) => c.totalEarnings > 0)
                            .sort((a: any, b: any) => (b.totalEarnings || 0) - (a.totalEarnings || 0));
                        
                        if (sortedClients.length > 0) {
                            const topClient = sortedClients[0];
                            newInsights.push({
                                id: 'client-top',
                                type: 'client',
                                title: 'Top Client',
                                description: `${topClient.name} has paid you $${topClient.totalEarnings.toLocaleString()} in total.`,
                                icon: 'star.fill',
                                priority: 2,
                                color: Colors.primary,
                                actionLabel: 'View Clients',
                                actionRoute: '/clients',
                            });
                        }
                    }
                }
            } catch (clientError) {
                console.log('Failed to fetch clients for top client insight:', clientError);
            }

            // Payment success rate
            const totalDocs = allDocs.length;
            const paidDocs = allDocs.filter(doc => doc.status === 'PAID').length;
            const paymentRate = totalDocs > 0 ? Math.round((paidDocs / totalDocs) * 100) : 0;

            if (totalDocs >= 3) {
                newInsights.push({
                    id: 'payment-rate',
                    type: 'generic',
                    title: 'Payment Rate',
                    description: `${paymentRate}% of your invoices have been paid. ${paidDocs} out of ${totalDocs} total.`,
                    icon: 'checkmark.circle.fill',
                    priority: 1,
                    color: paymentRate >= 80 ? Colors.success : paymentRate >= 50 ? Colors.warning : Colors.error,
                    trend: paymentRate >= 80 ? 'up' : paymentRate >= 50 ? 'neutral' : 'down',
                });
            }

            // Transaction insights - fetch from transactions API
            try {
                const txRes = await fetch(`${apiUrl}/api/transactions`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (txRes.ok) {
                    const txData = await txRes.json();
                    if (txData.success && txData.data?.transactions) {
                        const transactions = txData.data.transactions;
                        const now = new Date();
                        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        
                        // Count transactions this month
                        const txThisMonth = transactions.filter((tx: any) => 
                            new Date(tx.createdAt) >= startOfMonth
                        );
                        
                        // Calculate total received this month
                        const receivedThisMonth = txThisMonth
                            .filter((tx: any) => tx.type === 'PAYMENT_RECEIVED' && tx.status === 'CONFIRMED')
                            .reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);
                        
                        if (transactions.length > 0) {
                            newInsights.push({
                                id: 'transactions',
                                type: 'generic',
                                title: 'Transactions',
                                description: `${txThisMonth.length} transactions this month. $${receivedThisMonth.toLocaleString()} received.`,
                                icon: 'arrow.left.arrow.right',
                                priority: 3,
                                color: Colors.primary,
                            });
                        }
                    }
                }
            } catch (txError) {
                console.log('Failed to fetch transactions for insights:', txError);
            }

            // Offramp/Withdrawal insights
            try {
                const offrampRes = await fetch(`${apiUrl}/api/offramp/orders`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (offrampRes.ok) {
                    const offrampData = await offrampRes.json();
                    if (offrampData.success && offrampData.data?.orders) {
                        const orders = offrampData.data.orders;
                        const now = new Date();
                        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        
                        // Count withdrawals this month
                        const withdrawalsThisMonth = orders.filter((o: any) => 
                            new Date(o.createdAt) >= startOfMonth
                        );
                        
                        // Calculate total withdrawn this month
                        const totalWithdrawn = withdrawalsThisMonth
                            .filter((o: any) => o.status === 'COMPLETED')
                            .reduce((sum: number, o: any) => sum + (o.fiatAmount || 0), 0);
                        
                        // Check for pending withdrawals
                        const pendingWithdrawals = orders.filter((o: any) => 
                            o.status === 'PENDING' || o.status === 'PROCESSING'
                        );
                        
                        if (orders.length > 0) {
                            newInsights.push({
                                id: 'withdrawals',
                                type: 'generic',
                                title: 'Withdrawals',
                                description: pendingWithdrawals.length > 0 
                                    ? `${pendingWithdrawals.length} withdrawal${pendingWithdrawals.length > 1 ? 's' : ''} pending. ₦${totalWithdrawn.toLocaleString()} withdrawn this month.`
                                    : `${withdrawalsThisMonth.length} withdrawal${withdrawalsThisMonth.length !== 1 ? 's' : ''} this month. ₦${totalWithdrawn.toLocaleString()} total.`,
                                icon: 'arrow.down.to.line',
                                priority: pendingWithdrawals.length > 0 ? 8 : 2,
                                color: pendingWithdrawals.length > 0 ? Colors.warning : Colors.success,
                            });
                        }
                    }
                }
            } catch (offrampError) {
                console.log('Failed to fetch offramp orders for insights:', offrampError);
            }

            // Sort by priority (descending)
            setInsights(newInsights.sort((a, b) => b.priority - a.priority));

        } catch (err) {
            console.error('Failed to generate insights', err);
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { insights, loading, refetch: fetchData };
}
