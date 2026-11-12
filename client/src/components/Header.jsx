import React from 'react';
import { Layers, ShieldCheck, Cpu, RefreshCw } from 'lucide-react';

export default function Header({ config, isSimMode, onToggleSimMode, onRefresh }) {
  const isSandboxReady = config?.paypalSandboxConfigured && !isSimMode;

  return (
    <header className="header">
      <div className="brand">
        <div className="brand-icon">
          <Layers size={26} strokeWidth={2.2} />
        </div>
        <div>
          <h1>Procura</h1>
          <p>AI-Powered B2B Procurement Copilot & PayPal Settlement Engine</p>
        </div>
      </div>

      <div className="header-badges">
        <span className={`badge ${isSandboxReady ? 'badge-sandbox' : 'badge-sim'}`}>
          <span className="badge-pulse"></span>
          {isSandboxReady ? (
            <>
              <ShieldCheck size={14} /> PayPal Sandbox Active
            </>
          ) : (
            <>
              <Cpu size={14} /> Simulation Mode Active
            </>
          )}
        </span>

        {config?.paypalSandboxConfigured && (
          <button 
            className="chip" 
            onClick={onToggleSimMode}
            title="Toggle between real Sandbox checkout and instant Simulation Mode"
          >
            Switch to {isSimMode ? 'Sandbox' : 'Simulation'}
          </button>
        )}

        <button 
          className="btn-secondary" 
          onClick={onRefresh}
          style={{ padding: '6px 12px', fontSize: '12px' }}
          title="Refresh metrics & ledger"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </header>
  );
}

