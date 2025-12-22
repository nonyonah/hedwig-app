import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './lib/appkit'; // Initialize AppKit
import InvoicePage from './pages/InvoicePage';
import PaymentLinkPage from './pages/PaymentLinkPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Invoice routes */}
        <Route path="/invoice/:id" element={<InvoicePage />} />
        <Route path="/invoices/:id" element={<InvoicePage />} />

        {/* Payment link routes */}
        <Route path="/pay/:id" element={<PaymentLinkPage />} />
        <Route path="/payment-link/:id" element={<PaymentLinkPage />} />

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
