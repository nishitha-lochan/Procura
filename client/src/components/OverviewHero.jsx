import React from 'react';
import { ArrowRight, Bot, Scale, ShieldCheck } from 'lucide-react';

export default function OverviewHero({ onStartProcurement }) {
  return (
    <div className="hero-card">
      <div className="hero-content">
        <h2>
          Smarter Procurement. <span className="accent-word">Powered by AI.</span>
        </h2>
        <p>
          Compare suppliers, optimize purchasing costs, and manage business payments through one intelligent procurement workspace.
        </p>

        <div className="hero-features">
          <div className="hero-feature-item">
            <Bot size={15} />
            <span>AI-Powered Procurement Analysis</span>
          </div>
          <div className="hero-feature-item">
            <Scale size={15} />
            <span>Intelligent Supplier Comparison</span>
          </div>
          <div className="hero-feature-item">
            <ShieldCheck size={15} />
            <span>PayPal-Powered Payment Tracking</span>
          </div>
        </div>
      </div>

      <div className="hero-cta">
        <button
          type="button"
          className="btn-primary"
          onClick={onStartProcurement}
          style={{ padding: '12px 24px', fontSize: '14.5px' }}
        >
          Start New Procurement <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

