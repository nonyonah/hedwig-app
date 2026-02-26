import { BrowserRouter, Routes, Route } from 'react-router-dom';
import InvoicePage from './pages/InvoicePage';
import PaymentLinkPage from './pages/PaymentLinkPage';
import ContractPage from './pages/ContractPage';
import ExportWalletPage from './pages/ExportWalletPage';
import FeedbackPage from './pages/FeedbackPage';
import SuccessPage from './pages/SuccessPage';
import { PrivyWrapper } from './lib/PrivyWrapper';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Invoice routes */}
        <Route path="/invoice/:id" element={
          <PrivyWrapper>
            <InvoicePage />
          </PrivyWrapper>
        } />
        <Route path="/invoices/:id" element={
          <PrivyWrapper>
            <InvoicePage />
          </PrivyWrapper>
        } />

        {/* Contract routes */}
        <Route path="/contract/:id" element={<ContractPage />} />
        <Route path="/contracts/:id" element={<ContractPage />} />

        {/* Payment link routes */}
        <Route path="/pay/:id" element={
          <PrivyWrapper>
            <PaymentLinkPage />
          </PrivyWrapper>
        } />
        <Route path="/payment-link/:id" element={
          <PrivyWrapper>
            <PaymentLinkPage />
          </PrivyWrapper>
        } />

        {/* Export wallet route - wrapped with Privy */}
        <Route path="/export-wallet" element={
          <PrivyWrapper>
            <ExportWalletPage />
          </PrivyWrapper>
        } />

        {/* Feedback route - UserJot widget */}
        <Route path="/feedback" element={<FeedbackPage />} />

        {/* Success route */}
        <Route path="/success" element={<SuccessPage />} />

          {/* Fallback */}
          <Route path="*" element={
            <div className="container">
              <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>
                  Hedwig Payments
                </h1>
                <p style={{ color: '#666' }}>
                  Secure crypto payments for freelancers
                </p>
              </div>
            </div>
          } />
        </Routes>
    </BrowserRouter>
  );
}

export default App;
