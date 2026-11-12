import React from 'react';
import {
  Layers,
  LayoutDashboard,
  Bot,
  Award,
  CreditCard,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Settings,
  HelpCircle,
  User,
  ShieldCheck,
  Zap
} from 'lucide-react';

export default function Sidebar({
  activeSection,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  config,
  isSimMode
}) {
  const isSandboxReady = config?.paypalSandboxConfigured && !isSimMode;

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'copilot', label: 'AI Copilot', icon: Bot },
    { id: 'comparison', label: 'Supplier Matrix', icon: Award },
    { id: 'payment', label: 'Payment Center', icon: CreditCard },
    { id: 'ledger', label: 'Financial Ledger', icon: Receipt }
  ];

  const handleNavClick = (id) => {
    onNavigate(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-icon-box">
            <Layers size={22} strokeWidth={2.4} />
          </div>
          {!isCollapsed && (
            <div className="brand-info">
              <span className="brand-title">Procura</span>
              <span className="brand-subtitle">Intelligent Procurement</span>
            </div>
          )}
        </div>

        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon size={18} className="nav-icon" />
              {!isCollapsed && <span>{item.label}</span>}
            </div>
          );
        })}
      </nav>

      {/* Bottom Status & Profile */}
      <div className="sidebar-footer">
        {!isCollapsed && (
          <div className="connection-status-pill">
            <span className={`status-dot ${isSandboxReady ? 'sandbox' : 'simulation'}`}></span>
            <span style={{ color: isSandboxReady ? 'var(--accent-mint)' : 'var(--warning)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isSandboxReady ? 'PayPal Sandbox' : 'Simulation Mode'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', padding: '6px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--surface-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}>
              <User size={15} />
            </div>
            {!isCollapsed && (
              <div style={{ fontSize: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Procurement Ops</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Enterprise Buyer</div>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div style={{ display: 'flex', gap: '4px', color: 'var(--text-muted)' }}>
              <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }} title="Settings">
                <Settings size={14} />
              </button>
              <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }} title="Help & Docs">
                <HelpCircle size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

