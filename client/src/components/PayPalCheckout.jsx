import React, { useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { CreditCard, ShieldCheck, Info, X, Zap, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function PayPalCheckout({
  supplier,
  config,
  isSimMode,
  onPaymentSuccess,
  onClose
}) {
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!supplier) return null;

  const clientId = config?.paypalClientId || '';
  const isRealSandbox = Boolean(config?.paypalSandboxConfigured && clientId && !isSimMode);

  // Real PayPal createOrder handler
  const handleCreateOrder = async () => {
    try {
      setErrorMessage(null);
      const res = await api.createOrder(
        supplier.supplierId,
        supplier.requestedQuantity,
        supplier.maxBudget,
        false
      );
      if (!res.success) {
        throw new Error(res.error || 'Failed to initialize PayPal order.');
      }
      return res.orderID;
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setErrorMessage(msg);
      throw err;
    }
  };

  // Real PayPal onApprove capture handler
  const handleApprove = async (data) => {
    setIsProcessing(true);
    try {
      setErrorMessage(null);
      const res = await api.captureOrder(data.orderID, {
        supplierId: supplier.supplierId,
        supplierName: supplier.name,
        quantity: supplier.requestedQuantity,
        unitPrice: supplier.unitPrice,
        shippingCost: supplier.shippingCost,
        totalAmount: supplier.totalCost,
        estimatedSavings: supplier.estimatedSavings
      });

      if (!res.success) {
        throw new Error(res.error || 'Capture verification failed.');
      }

      onPaymentSuccess(res.transaction);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Instant / Simulation payment trigger
  const handleInstantPayment = async () => {
    setIsProcessing(true);
    try {
      setErrorMessage(null);
      const res = await api.createOrder(
        supplier.supplierId,
        supplier.requestedQuantity,
        supplier.maxBudget,
        true // forceSimulation
      );
      const captureRes = await api.captureOrder(res.orderID, {
        supplierId: supplier.supplierId,
        supplierName: supplier.name,
        quantity: supplier.requestedQuantity,
        unitPrice: supplier.unitPrice,
        shippingCost: supplier.shippingCost,
        totalAmount: supplier.totalCost,
        estimatedSavings: supplier.estimatedSavings
      });

      onPaymentSuccess(captureRes.transaction);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="payment-section" id="payment-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '14px' }}>
        <div>
          <h2 className="section-title">
            <CreditCard size={22} style={{ color: 'var(--primary)' }} />
            Payment Center
          </h2>
          <p className="section-subtitle">
            Review your purchasing order and approve payment securely through PayPal.
          </p>
        </div>

        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          title="Close payment drawer"
        >
          <X size={20} />
        </button>
      </div>

      <div className="checkout-summary-grid">
        {/* Order Details Column */}
        <div className="summary-spec-box">
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-light)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Requisition Specifications
          </div>
          <div className="spec-line">
            <span>Supplier</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{supplier.name}</span>
          </div>
          <div className="spec-line">
            <span>Item / Product</span>
            <span>{supplier.product}</span>
          </div>
          <div className="spec-line">
            <span>Order Quantity</span>
            <span className="font-mono">{supplier.requestedQuantity} units</span>
          </div>
          <div className="spec-line">
            <span>Unit Price</span>
            <span className="font-mono">${supplier.unitPrice?.toFixed(2)}</span>
          </div>
          <div className="spec-line">
            <span>Payment Mode</span>
            <span className={`badge ${isRealSandbox ? 'badge-sandbox' : 'badge-sim'}`} style={{ fontSize: '10px' }}>
              {isRealSandbox ? 'SANDBOX VERIFIED' : 'SIMULATION'}
            </span>
          </div>
        </div>

        {/* Cost & Settlement Column */}
        <div className="summary-spec-box">
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-light)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Financial Breakdown
          </div>
          <div className="spec-line">
            <span>Subtotal ({supplier.requestedQuantity} × ${supplier.unitPrice?.toFixed(2)})</span>
            <span className="font-mono">${(supplier.unitPrice * supplier.requestedQuantity).toFixed(2)}</span>
          </div>
          <div className="spec-line">
            <span>Shipping & Handling</span>
            <span className="font-mono">${supplier.shippingCost?.toFixed(2)}</span>
          </div>
          {supplier.estimatedSavings > 0 && (
            <div className="spec-line" style={{ color: 'var(--accent-mint)', fontWeight: 600 }}>
              <span>Budget Savings</span>
              <span className="font-mono">+${supplier.estimatedSavings?.toFixed(2)}</span>
            </div>
          )}
          <div className="spec-line total">
            <span>Total Authoritative Settlement</span>
            <span className="font-mono" style={{ color: 'var(--accent-mint)' }}>
              ${supplier.totalCost?.toFixed(2)} USD
            </span>
          </div>
        </div>
      </div>

      {/* Settlement Disclosure */}
      <div className="disclosure-box">
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          <strong>Settlement Disclosure:</strong> Sandbox payments are settled to the configured platform Sandbox Merchant account. Supplier references are retained as transaction metadata for reconciliation.
        </span>
      </div>

      {/* Error Display */}
      {errorMessage && (
        <div style={{ color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid rgba(251, 113, 133, 0.3)', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '18px' }}>
          ❌ {errorMessage}
        </div>
      )}

      {/* Interactive Checkout Area */}
      {isProcessing ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight: 600 }}>
          <Loader2 size={18} className="animate-spin" />
          <span>Verifying order and capturing payment through PayPal...</span>
        </div>
      ) : (
        <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Method 1: Official PayPal Smart Buttons */}
          {isRealSandbox && clientId && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textAlign: 'center', fontWeight: 500 }}>
                Option 1: Official PayPal Sandbox Checkout
              </div>
              <PayPalScriptProvider key={clientId} options={{ "client-id": clientId, currency: "USD", intent: "capture" }}>
                <PayPalButtons
                  style={{ layout: "vertical", shape: "rect", color: "gold", height: 44 }}
                  createOrder={handleCreateOrder}
                  onApprove={handleApprove}
                  onError={(err) => setErrorMessage(err.message || 'PayPal Checkout encountered an error.')}
                />
              </PayPalScriptProvider>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center', lineHeight: 1.4 }}>
                ℹ️ Tip: Log in with your <strong>Personal (Buyer)</strong> test account (e.g. <code>sb-csxoo5...</code>), not the seller account.
              </div>
            </div>
          )}

          {/* Divider */}
          {isRealSandbox && clientId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-primary)' }}></div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-primary)' }}></div>
            </div>
          )}

          {/* Method 2: Instant Demo / Simulation Settlement Button */}
          <div>
            {isRealSandbox && clientId && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textAlign: 'center', fontWeight: 500 }}>
                Option 2: 1-Click Settlement (Fast Hackathon Demo)
              </div>
            )}
            <button
              type="button"
              className="sim-checkout-btn"
              onClick={handleInstantPayment}
            >
              <Zap size={18} /> Complete Verified Settlement (${supplier.totalCost?.toFixed(2)} USD)
            </button>
            <p style={{ textAlign: 'center', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Instant verification: captures and records transaction directly to the AG Grid audit ledger.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
