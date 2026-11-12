import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import OverviewHero from './components/OverviewHero';
import MetricCards from './components/MetricCards';
import RequisitionInput from './components/RequisitionInput';
import AgentAnalysisCard from './components/AgentAnalysisCard';
import SupplierComparison from './components/SupplierComparison';
import PayPalCheckout from './components/PayPalCheckout';
import LedgerGrid from './components/LedgerGrid';
import StatusModal from './components/StatusModal';
import { api } from './services/api';

export default function App() {
  const [config, setConfig] = useState(null);
  const [isSimMode, setIsSimMode] = useState(false);
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [agentResult, setAgentResult] = useState(() => {
    try {
      const saved = localStorage.getItem('procura_active_agent_result');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [selectedSupplier, setSelectedSupplier] = useState(() => {
    try {
      const saved = localStorage.getItem('procura_selected_supplier');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isQuoteSettled, setIsQuoteSettled] = useState(() => {
    try {
      return localStorage.getItem('procura_is_quote_settled') === 'true';
    } catch {
      return false;
    }
  });
  const [completedTransaction, setCompletedTransaction] = useState(null);

  const saveAgentResult = (res) => {
    setAgentResult(res);
    try {
      if (res) localStorage.setItem('procura_active_agent_result', JSON.stringify(res));
      else localStorage.removeItem('procura_active_agent_result');
    } catch (e) {}
  };

  const saveSelectedSupplier = (sup) => {
    setSelectedSupplier(sup);
    try {
      if (sup) localStorage.setItem('procura_selected_supplier', JSON.stringify(sup));
      else localStorage.removeItem('procura_selected_supplier');
    } catch (e) {}
  };

  const saveIsQuoteSettled = (val) => {
    setIsQuoteSettled(val);
    try {
      if (val) localStorage.setItem('procura_is_quote_settled', 'true');
      else localStorage.removeItem('procura_is_quote_settled');
    } catch (e) {}
  };

  // Layout UI state
  const [activeSection, setActiveSection] = useState('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  // Load initial backend status, stats, and transactions
  const loadDashboardData = useCallback(async () => {
    try {
      setIsDashboardLoading(true);
      const [healthRes, statsRes, txnRes] = await Promise.all([
        api.getHealth(),
        api.getStats(),
        api.getTransactions()
      ]);

      setConfig(healthRes.config);
      setStats(statsRes.stats);
      setTransactions(txnRes.data);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle Requisition Submission with Priority
  const handleRequisitionSubmit = async (prompt, priority = 'balanced') => {
    setIsAgentLoading(true);
    saveSelectedSupplier(null);
    saveIsQuoteSettled(false);
    try {
      // Append priority intent if specified
      const augmentedPrompt = priority && priority !== 'balanced'
        ? `${prompt} (Priority: prioritize ${priority})`
        : prompt;

      const result = await api.runProcureAgent(augmentedPrompt);
      saveAgentResult(result);
      saveIsQuoteSettled(false);

      // Auto-select top recommended supplier for convenience
      if (result.recommendation?.topQuote) {
        saveSelectedSupplier(result.recommendation.topQuote);
      }

      // Smooth scroll to comparison matrix
      setTimeout(() => {
        const el = document.getElementById('comparison-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 200);

    } catch (err) {
      console.error('Agent requisition failed:', err);
      alert('Failed to analyze requisition: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsAgentLoading(false);
    }
  };

  // Handle Successful Settlement
  const handlePaymentSuccess = async (txn) => {
    setCompletedTransaction(txn);
    saveSelectedSupplier(null); // Close checkout drawer cleanly
    saveIsQuoteSettled(true); // Auto-reset active estimated savings to $0.00 (Settled)
    // Retain agentResult in state and localStorage so the AI evaluation and supplier matrix
    // remain viewable in the workspace after settlement.
    await loadDashboardData();
  };

  const handleSelectSupplierForPayment = (supplier) => {
    saveSelectedSupplier(supplier);
    saveIsQuoteSettled(false);
    setActiveSection('payment');
    setTimeout(() => {
      const el = document.getElementById('payment-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleStartProcurement = () => {
    setActiveSection('copilot');
    setTimeout(() => {
      const el = document.getElementById('copilot-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  // Determine if active quote is already settled in the ledger
  const topSupplierId = agentResult?.recommendation?.topQuote?.supplierId || agentResult?.recommendation?.selectedSupplierId;
  const isLatestTxnMatchingQuote = Boolean(
    topSupplierId &&
    transactions.length > 0 &&
    transactions[0]?.supplierId === topSupplierId &&
    transactions[0]?.paymentStatus === 'COMPLETED'
  );
  const effectiveQuoteSettled = isQuoteSettled || isLatestTxnMatchingQuote;

  const activeQuote = effectiveQuoteSettled ? null : (selectedSupplier || agentResult?.recommendation?.topQuote);
  const currentEstimatedSavings = effectiveQuoteSettled ? 0 : (activeQuote?.estimatedSavings ?? agentResult?.recommendation?.estimatedSavings ?? 0);
  const activeQuoteName = effectiveQuoteSettled ? null : (activeQuote?.name || agentResult?.recommendation?.selectedSupplierName || null);

  return (
    <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* 1. Left Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onNavigate={(sec) => {
          setActiveSection(sec);
          const targetId = sec === 'overview' ? 'overview-section'
            : sec === 'copilot' ? 'copilot-section'
            : sec === 'comparison' ? 'comparison-section'
            : sec === 'payment' ? 'payment-section'
            : 'ledger-section';
          const el = document.getElementById(targetId);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        config={config}
        isSimMode={isSimMode}
      />

      {/* 2. Main Workspace */}
      <div className="main-workspace">
        {/* Top Navigation */}
        <TopNav
          activeSection={activeSection}
          config={config}
          isSimMode={isSimMode}
          onToggleSimMode={() => setIsSimMode(!isSimMode)}
          onRefresh={loadDashboardData}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        {/* Content Area */}
        <main className="content-area">
          {/* Section: Overview Hero & KPIs */}
          <div id="overview-section">
            <OverviewHero onStartProcurement={handleStartProcurement} />
            <MetricCards
              stats={stats}
              transactions={transactions}
              currentEstimatedSavings={currentEstimatedSavings}
              activeQuoteName={activeQuoteName}
              isQuoteSettled={effectiveQuoteSettled}
              isLoading={isDashboardLoading}
            />
          </div>

          {/* Section: AI Procurement Copilot */}
          <RequisitionInput
            onSubmit={handleRequisitionSubmit}
            isLoading={isAgentLoading}
          />

          {/* Section: AI Analysis Narrative & Parameters */}
          {agentResult && (
            <AgentAnalysisCard agentResult={agentResult} />
          )}

          {/* Section: Supplier Comparison Matrix */}
          {agentResult?.comparison && (
            <SupplierComparison
              comparison={agentResult.comparison}
              recommendationText={agentResult.recommendationText}
              supplierRisks={agentResult.supplierRisks}
              selectedSupplierId={selectedSupplier?.supplierId}
              onSelectSupplier={handleSelectSupplierForPayment}
            />
          )}

          {/* Section: PayPal Payment Center */}
          {selectedSupplier && (
            <PayPalCheckout
              supplier={selectedSupplier}
              config={config}
              isSimMode={isSimMode}
              onPaymentSuccess={handlePaymentSuccess}
              onClose={() => saveSelectedSupplier(null)}
            />
          )}

          {/* Section: Financial Audit Ledger */}
          <LedgerGrid transactions={transactions} />
        </main>
      </div>

      {/* 3. Settlement Receipt Modal */}
      {completedTransaction && (
        <StatusModal
          transaction={completedTransaction}
          onClose={() => setCompletedTransaction(null)}
        />
      )}
    </div>
  );
}
