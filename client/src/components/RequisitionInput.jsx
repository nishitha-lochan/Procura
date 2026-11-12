import React, { useState, useEffect } from 'react';
import { Bot, Send, Sparkles, CheckCircle2, Clock, Loader2 } from 'lucide-react';

const SAMPLES = [
  { label: '🪑 100 Chairs · $5,000', text: 'I need 100 ergonomic office chairs within a $5,000 budget. Compare suppliers and recommend the best option.', priority: 'balanced' },
  { label: '💻 25 Laptops · $22,000', text: 'Procure 25 enterprise laptops with 16GB RAM for engineers within a $22,000 budget.', priority: 'quality' },
  { label: '📹 15 Webcams · $3,500', text: 'Need 15 units of 4K AI conference cameras for meeting rooms under $3,500 budget.', priority: 'speed' },
  { label: '⚡ 40 Standing Desks · $12k', text: 'Procure 40 dual-motor electric standing desks within a $12,000 budget. Prioritize lowest overall cost.', priority: 'cost' }
];

const STAGES = [
  "Understanding procurement requirements",
  "Retrieving supplier quotations",
  "Validating stock and budget constraints",
  "Calculating multi-factor supplier scores",
  "Generating executive AI recommendation"
];

export default function RequisitionInput({ onSubmit, isLoading }) {
  const [prompt, setPrompt] = useState(
    "I need 100 ergonomic office chairs within a $5,000 budget. Compare suppliers and recommend the best option."
  );
  const [selectedPriority, setSelectedPriority] = useState('balanced');
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Analysis Progress Simulation while waiting for backend
  useEffect(() => {
    let interval = null;
    let timer = null;

    if (isLoading) {
      setCurrentStageIdx(0);
      setElapsedSeconds(0);

      timer = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);

      interval = setInterval(() => {
        setCurrentStageIdx((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
      }, 700);
    } else {
      setCurrentStageIdx(STAGES.length - 1);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timer) clearInterval(timer);
    };
  }, [isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt.trim(), selectedPriority);
  };

  const handleChipClick = (sample) => {
    setPrompt(sample.text);
    setSelectedPriority(sample.priority);
  };

  return (
    <section className="copilot-section" id="copilot-section">
      <div className="section-header">
        <h2 className="section-title">
          <Bot size={22} style={{ color: 'var(--primary)' }} />
          AI Procurement Copilot
        </h2>
        <p className="section-subtitle">
          Describe your purchasing needs. Let AI evaluate supplier quotations and recommend the smartest purchasing decision.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="copilot-input-box">
          <textarea
            className="copilot-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. I need 100 ergonomic office chairs within a $5,000 budget. Compare suppliers and recommend the best option."
            rows={3}
            disabled={isLoading}
          />
        </div>

        <div className="copilot-toolbar">
          {/* Sample Chips */}
          <div className="prompt-chips-group">
            <span className="chips-label">Sample Prompts:</span>
            {SAMPLES.map((sample, idx) => (
              <button
                type="button"
                key={idx}
                className="chip-btn"
                onClick={() => handleChipClick(sample)}
                disabled={isLoading}
              >
                <Sparkles size={11} style={{ marginRight: '4px', display: 'inline', color: 'var(--primary)' }} />
                {sample.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Priority Selector */}
            <div className="priority-selector">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                Priority:
              </span>
              {[
                { id: 'balanced', label: 'Best Overall' },
                { id: 'cost', label: 'Lowest Cost' },
                { id: 'speed', label: 'Fastest Delivery' },
                { id: 'quality', label: 'Highest Quality' }
              ].map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`priority-pill ${selectedPriority === p.id ? 'active' : ''}`}
                  onClick={() => setSelectedPriority(p.id)}
                  disabled={isLoading}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Evaluating...
                </>
              ) : (
                <>
                  <Send size={15} /> Analyze Procurement
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Analysis Progress Experience Panel */}
      {isLoading && (
        <div className="analysis-progress-panel">
          <div className="progress-header">
            <span className="progress-title">
              <Loader2 size={15} className="animate-spin" />
              Evaluating Requisition Across Real Supplier Catalog...
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> {elapsedSeconds}s elapsed
            </span>
          </div>

          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${((currentStageIdx + 1) / STAGES.length) * 100}%` }}
            ></div>
          </div>

          <div className="stages-list">
            {STAGES.map((stage, idx) => {
              const isCompleted = idx < currentStageIdx;
              const isCurrent = idx === currentStageIdx;

              return (
                <div
                  key={idx}
                  className={`stage-item ${isCompleted ? 'completed' : isCurrent ? 'current' : ''}`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--accent-mint)' }} />
                  ) : isCurrent ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
                  ) : (
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '1px solid var(--border-secondary)' }}></div>
                  )}
                  <span>{stage}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
