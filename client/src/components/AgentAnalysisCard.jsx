import React, { useState } from 'react';
import { Cpu, ChevronDown, ChevronUp, Terminal, Activity, CheckCircle2 } from 'lucide-react';

export default function AgentAnalysisCard({ agentResult }) {
  const [showToolTrace, setShowToolTrace] = useState(false);

  if (!agentResult) return null;

  const {
    agentMode,
    recommendationText,
    requirements,
    toolTrace,
    totalTurns,
    notice,
    modelUsed
  } = agentResult;

  const isAutonomous = agentMode === 'GEMINI_AUTONOMOUS';

  return (
    <div className="agent-result-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}>
            <Cpu size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Procurement Copilot Evaluation
            </h3>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Powered by Google Gemini Autonomous Multi-Turn Agent
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`badge ${isAutonomous ? 'badge-sandbox' : 'badge-sim'}`}>
            <Activity size={12} /> {isAutonomous ? `Gemini (${modelUsed || 'Live'})` : 'Deterministic Copilot'}
          </span>
          <span className="badge badge-sample">
            {totalTurns || 4} Tool Executions
          </span>
        </div>
      </div>

      {/* Gentle info notice if any */}
      {notice && (
        <div style={{ fontSize: '12.5px', color: 'var(--primary-light)', background: 'var(--info-bg)', border: '1px solid rgba(103, 232, 249, 0.25)', padding: '8px 14px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>ℹ️</span>
          <span>{notice}</span>
        </div>
      )}

      {/* Executive Narrative */}
      <div className="agent-narrative-box">
        {recommendationText}
      </div>

      {/* Extracted Parameters Grid */}
      {requirements && (
        <div className="extracted-params-grid">
          <div className="param-box">
            <div className="param-title">Extracted Item</div>
            <div className="param-value">{requirements.item}</div>
          </div>
          <div className="param-box">
            <div className="param-title">Required Quantity</div>
            <div className="param-value">{requirements.quantity} units</div>
          </div>
          <div className="param-box">
            <div className="param-title">Target Budget</div>
            <div className="param-value">
              {requirements.maxBudget > 0 ? `$${requirements.maxBudget.toLocaleString('en-US')}` : 'Uncapped'}
            </div>
          </div>
          <div className="param-box">
            <div className="param-title">Priority Focus</div>
            <div className="param-value" style={{ textTransform: 'capitalize' }}>
              {requirements.priority || 'Balanced'}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Tool Execution Trace */}
      {toolTrace && toolTrace.length > 0 && (
        <div className="tool-trace-collapsible">
          <button
            type="button"
            className="tool-trace-toggle-btn"
            onClick={() => setShowToolTrace(!showToolTrace)}
          >
            <Terminal size={14} />
            <span>{showToolTrace ? 'Hide AI Tool Execution Trace' : 'View AI Tool Execution Trace (Audited Tools)'}</span>
            {showToolTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showToolTrace && (
            <div className="trace-items-container">
              {toolTrace.map((t, idx) => (
                <div key={idx} className="trace-pill">
                  <CheckCircle2 size={13} style={{ color: 'var(--accent-mint)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>Turn {t.turn || idx + 1}:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{t.tool}()</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '350px' }}>
                    {JSON.stringify(t.args || {})}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
