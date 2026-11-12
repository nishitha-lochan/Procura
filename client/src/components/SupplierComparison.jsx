import React, { useState } from 'react';
import {
  Award,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Star,
  Clock,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Sparkles,
  Info
} from 'lucide-react';

export default function SupplierComparison({
  comparison,
  recommendationText,
  supplierRisks = [],
  onSelectSupplier,
  selectedSupplierId
}) {
  const [showScoringGuide, setShowScoringGuide] = useState(false);

  if (!comparison || comparison.length === 0) return null;

  const topSupplier = comparison.find((q) => q.isRecommended) || comparison[0];
  const alternativeSuppliers = comparison.filter((q) => q.supplierId !== topSupplier?.supplierId);

  return (
    <section className="comparison-section" id="comparison-section">
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="section-title">
            <Award size={22} style={{ color: 'var(--primary)' }} />
            Intelligent Supplier Quotation Matrix
          </h2>
          <p className="section-subtitle">
            Autonomous multi-factor evaluation across Price, Delivery Time, Warranty, Stock Status, and Risk Level.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge badge-sample" style={{ fontSize: '11px' }}>
            {comparison.length} VETTED SUPPLIERS
          </span>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => setShowScoringGuide(!showScoringGuide)}
          >
            <HelpCircle size={13} />
            <span>Scoring Model</span>
            {showScoringGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Collapsible Scoring Model Details */}
      {showScoringGuide && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginTop: '16px',
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--text-secondary)'
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Deterministic Multi-Factor Scoring Architecture (5 Dimensions — Balanced Weights: 100%):
          </div>
          <p>
            1. <strong>Pre-filtering</strong>: Vendors with stock &lt; requested volume or landed cost exceeding budget cap are disqualified prior to ranking.<br />
            2. <strong>Landed Cost (35%)</strong>: Range-normalized score: 100 × (MaxCost - Cost) / (MaxCost - MinCost). Cheapest compliant receives 100.<br />
            3. <strong>Delivery SLA (20%)</strong>: Lead-time score: max(0, 100 - (days × 5)). Faster delivery receives higher score.<br />
            4. <strong>Warranty Coverage (15%)</strong>: Evaluates warranty duration (5-Yr: 100, 3-Yr: 70, 1-Yr: 40, Lifetime: 100).<br />
            5. <strong>Stock Cushion (15%)</strong>: Inventory depth relative to order volume (1.0x match: 50, 5.0x+ cushion: 100).<br />
            6. <strong>Operational Risk (15%)</strong>: Evaluates risk tier (Low: 90+, Med: 60, High: 30) blended with verified supplier rating.<br />
            7. <strong>Deterministic Tie-Breaker</strong>: Composite Score → Lower Landed Cost → Higher Risk Score → Higher Rating → Faster Delivery.
          </p>
        </div>
      )}

      {/* 5-Dimension Supplier Comparison Matrix Table */}
      <div className="supplier-table-wrap">
        <table className="supplier-table">
          <thead>
            <tr>
              <th>Supplier & Product</th>
              <th>1. Price & Landed Cost</th>
              <th>2. Delivery Time</th>
              <th>3. Warranty</th>
              <th>4. Stock Status</th>
              <th>5. Risk Level</th>
              <th>Composite Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((supplier) => {
              const isSelected = selectedSupplierId === supplier.supplierId;
              const isRec = supplier.isRecommended;
              const isCompliant = supplier.isCompliant;

              // Format Risk Badge color
              const risk = (supplier.riskLevel || 'Low Risk').toLowerCase();
              const isLowRisk = risk.includes('low');
              const isMedRisk = risk.includes('medium') || risk.includes('med');

              return (
                <tr
                  key={supplier.supplierId}
                  className={`${isRec ? 'row-recommended' : ''} ${!isCompliant ? 'row-disqualified' : ''}`}
                  style={{
                    backgroundColor: isSelected ? 'rgba(249, 115, 22, 0.08)' : undefined
                  }}
                >
                  {/* Supplier & Product */}
                  <td>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {supplier.name}
                        </span>
                        {isRec && (
                          <span
                            className="badge badge-sandbox"
                            style={{ fontSize: '10px', padding: '2px 8px', fontWeight: 700 }}
                          >
                            ★ RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {supplier.product}
                      </div>
                    </div>
                  </td>

                  {/* 1. Price & Landed Cost */}
                  <td>
                    <div>
                      <span className="font-mono" style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                        ${supplier.totalCost?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        ${supplier.unitPrice?.toFixed(2)}/unit + ${supplier.shippingCost?.toFixed(2)} freight
                      </div>
                    </div>
                  </td>

                  {/* 2. Delivery Time */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={13} style={{ color: 'var(--secondary)' }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {supplier.estimatedDeliveryDays} Days
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {supplier.estimatedDeliveryDays <= 3 ? 'Expedited Courier' : 'Ground Freight'}
                    </div>
                  </td>

                  {/* 3. Warranty */}
                  <td>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {supplier.warranty || '1-Year Standard'}
                    </span>
                  </td>

                  {/* 4. Stock Status */}
                  <td>
                    <div>
                      <span
                        className="badge"
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          backgroundColor: supplier.hasSufficientStock ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                          color: supplier.hasSufficientStock ? 'var(--accent-mint)' : 'var(--danger)',
                          border: `1px solid ${supplier.hasSufficientStock ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}
                      >
                        {supplier.hasSufficientStock ? '✓ In Stock' : '✗ Insufficient'}
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {supplier.availableQuantity} units available
                      </div>
                    </div>
                  </td>

                  {/* 5. Risk Level */}
                  <td>
                    <span
                      className="badge"
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        backgroundColor: isLowRisk
                          ? 'rgba(16, 185, 129, 0.12)'
                          : isMedRisk
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(239, 68, 68, 0.12)',
                        color: isLowRisk ? 'var(--accent-mint)' : isMedRisk ? 'var(--warning)' : 'var(--danger)',
                        border: `1px solid ${
                          isLowRisk
                            ? 'rgba(16, 185, 129, 0.3)'
                            : isMedRisk
                            ? 'rgba(245, 158, 11, 0.3)'
                            : 'rgba(239, 68, 68, 0.3)'
                        }`
                      }}
                    >
                      {supplier.riskLevel || (isCompliant ? 'Low Risk' : 'High Risk')}
                    </span>
                  </td>

                  {/* Composite Score */}
                  <td>
                    {isCompliant ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-mono" style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: '14px' }}>
                            {supplier.compositeScore}/100
                          </span>
                          <div style={{ fontSize: '11px', color: 'var(--warning)', display: 'flex', alignItems: 'center' }}>
                            <Star size={11} fill="currentColor" />
                            <span style={{ marginLeft: '2px' }}>{supplier.supplierRating}</span>
                          </div>
                        </div>
                        {supplier.scoreBreakdown && (
                          <div
                            style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px', cursor: 'help' }}
                            title={`Cost: ${supplier.scoreBreakdown.costScore} | Speed: ${supplier.scoreBreakdown.speedScore} | Warranty: ${supplier.scoreBreakdown.warrantyScore} | Stock: ${supplier.scoreBreakdown.stockScore} | Risk: ${supplier.scoreBreakdown.riskScore}`}
                          >
                            5D: C:{Math.round(supplier.scoreBreakdown.costScore)} S:{Math.round(supplier.scoreBreakdown.speedScore)} W:{Math.round(supplier.scoreBreakdown.warrantyScore)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="badge badge-disqualified" style={{ fontSize: '10.5px' }}>
                        Disqualified
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td>
                    {isCompliant ? (
                      <button
                        type="button"
                        onClick={() => onSelectSupplier(supplier)}
                        className={isRec ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--danger)' }} title={supplier.disqualificationReasons?.[0]}>
                        Exceeds Limits
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Prominent Gemini Executive Recommendation Banner */}
      {topSupplier && (
        <div className="recommendation-banner" style={{ marginTop: '24px' }}>
          <div className="rec-left">
            <div className="rec-icon" style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)', color: 'var(--primary)' }}>
              <Sparkles size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="rec-title">{topSupplier.name}</span>
                <span className="badge badge-sandbox" style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)', color: 'var(--primary)', borderColor: 'rgba(249, 115, 22, 0.3)' }}>
                  Gemini Recommended Choice
                </span>
              </div>
              <div className="rec-desc" style={{ maxWidth: '780px', marginTop: '6px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                {recommendationText || topSupplier.notes || 'Optimal balance across landed cost, lead time, warranty coverage, and lowest operational risk.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Landed Settlement
              </div>
              <div className="rec-price" style={{ color: 'var(--text-primary)' }}>
                ${topSupplier.totalCost?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {topSupplier.estimatedSavings > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--accent-mint)', fontWeight: 600 }}>
                  +${topSupplier.estimatedSavings.toFixed(2)} Realized Savings Potential
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => onSelectSupplier(topSupplier)}
              style={{ padding: '12px 24px', fontSize: '14px' }}
            >
              Approve & Proceed to Settlement <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Explicit Alternative Supplier Risk Analysis Panel */}
      {alternativeSuppliers.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <ShieldAlert size={18} style={{ color: 'var(--warning)' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Alternative Supplier Risk Analysis
            </span>
            <span className="badge badge-sample" style={{ fontSize: '11px' }}>
              GEMINI COGNITIVE AUDIT
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {alternativeSuppliers.map((alt) => {
              const matchedRisk = supplierRisks.find((r) => r.supplierId === alt.supplierId);
              const riskSummary =
                matchedRisk?.riskSummary ||
                alt.disqualificationReasons?.join('. ') ||
                alt.riskFactors ||
                'Higher shipping lead times or warranty constraints detected.';

              const isDisqualified = !alt.isCompliant;

              return (
                <div
                  key={alt.supplierId}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: `1px solid ${isDisqualified ? 'rgba(239, 68, 68, 0.25)' : 'var(--border-primary)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                        {alt.name}
                      </span>
                      <span
                        className="badge"
                        style={{
                          fontSize: '10.5px',
                          padding: '1px 6px',
                          backgroundColor: isDisqualified ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isDisqualified ? 'var(--danger)' : 'var(--warning)',
                          border: `1px solid ${isDisqualified ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                      >
                        {isDisqualified ? 'DISQUALIFIED' : alt.riskLevel || 'Medium Risk'}
                      </span>
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {riskSummary}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--border-primary)',
                      paddingTop: '10px',
                      fontSize: '11.5px',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <span>Landed Cost: <strong>${alt.totalCost?.toFixed(2)}</strong></span>
                    <span>Lead Time: <strong>{alt.estimatedDeliveryDays} days</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
