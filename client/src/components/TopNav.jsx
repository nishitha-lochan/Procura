import React from 'react';
import { Menu, ShieldCheck, Cpu, RefreshCw, ChevronRight } from 'lucide-react';

export default function TopNav({
  activeSection,
  config,
  isSimMode,
  onToggleSimMode,
  onRefresh,
  onToggleMobileMenu
}) {
  const isSandboxReady = config?.paypalSandboxConfigured && !isSimMode;

  const sectionTitles = {
    overview: 'Executive Overview',
    copilot: 'AI Procurement Copilot',
    comparison: 'Supplier Quotation Matrix',
    payment: 'PayPal Settlement Center',
    ledger: 'Financial Audit Ledger'
  };

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <button className="mobile-menu-btn" onClick={onToggleMobileMenu} title="Open navigation">
          <Menu size={20} />
        </button>

        <div className="page-breadcrumb">
          <span>Workspace</span>
          <ChevronRight size={14} />
          <span className="page-title-badge">{sectionTitles[activeSection] || 'Overview'}</span>
        </div>
      </div>

      <div className="top-nav-right">
        {/* Sandbox vs Simulation Badge */}
        <span className={`badge ${isSandboxReady ? 'badge-sandbox' : 'badge-sim'}`}>
          {isSandboxReady ? (
            <>
              <ShieldCheck size={13} /> PayPal Sandbox Active
            </>
          ) : (
            <>
              <Cpu size={13} /> Simulation Mode Active
            </>
          )}
        </span>

        {/* Toggle Mode */}
        {config?.paypalSandboxConfigured && (
          <button
            className="btn-secondary"
            onClick={onToggleSimMode}
            style={{ padding: '6px 12px', fontSize: '12px' }}
            title="Toggle between live Sandbox payment and Simulation Mode"
          >
            Switch to {isSimMode ? 'Sandbox' : 'Simulation'}
          </button>
        )}

        {/* Refresh */}
        <button
          className="btn-secondary"
          onClick={onRefresh}
          style={{ padding: '6px 12px', fontSize: '12px' }}
          title="Refresh ledger & stats"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </header>
  );
}

