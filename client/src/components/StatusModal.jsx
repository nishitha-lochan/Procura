import React from 'react';
import { CheckCircle2, ShieldCheck, ArrowRight, ExternalLink } from 'lucide-react';

export default function StatusModal({ transaction, onClose }) {
  if (!transaction) return null;

  const isSandbox = transaction.paymentMode === 'SANDBOX_VERIFIED';

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-success-badge">
          <CheckCircle2 size={34} />
        </div>

        <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Payment Settlement Verified!
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
          {isSandbox 
            ? "Your payment was captured and cryptographically verified through the PayPal Sandbox API."
            : "Simulated financial settlement captured and posted to the audit ledger."}
        </p>

        <div className="modal-receipt-box">
          <div className="receipt-line">
            <span>Transaction ID</span>
            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-light)' }}>
              {transaction.transactionId}
            </span>
          </div>
          <div className="receipt-line">
            <span>PayPal Order ID</span>
            <span className="font-mono">{transaction.paypalOrderId}</span>
          </div>
          <div className="receipt-line">
            <span>PayPal Capture ID</span>
            <span className="font-mono">{transaction.paypalCaptureId}</span>
          </div>
          <div className="receipt-line">
            <span>Supplier</span>
            <span style={{ color: 'var(--text-primary)' }}>{transaction.supplierName}</span>
          </div>
          <div className="receipt-line highlight">
            <span>Total Settled</span>
            <span className="font-mono" style={{ color: 'var(--accent-mint)' }}>
              ${transaction.totalAmount?.toFixed(2)} USD
            </span>
          </div>
          {transaction.realizedSavings > 0 && (
            <div className="receipt-line" style={{ color: 'var(--accent-mint)', fontWeight: 600 }}>
              <span>Realized Budget Savings</span>
              <span className="font-mono">+${transaction.realizedSavings?.toFixed(2)} USD</span>
            </div>
          )}
          <div className="receipt-line">
            <span>Settlement Mode</span>
            <span className={`badge ${isSandbox ? 'badge-sandbox' : 'badge-sim'}`} style={{ fontSize: '10.5px' }}>
              {transaction.paymentMode}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          onClick={onClose}
        >
          View in Financial Audit Ledger <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
