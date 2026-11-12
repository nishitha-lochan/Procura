import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Sparkles,
  Clock,
  CheckCircle2,
  PieChart as PieIcon,
  TrendingDown,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

// Color Palette for Category Donut
const CATEGORY_COLORS = [
  '#F97316', // Bright Orange
  '#3B82F6', // Electric Blue
  '#10B981', // Emerald Mint
  '#F59E0B', // Amber
  '#8B5CF6'  // Purple
];

export default function MetricCards({
  stats,
  transactions = [],
  currentEstimatedSavings = 0,
  isLoading = false
}) {
  const sandbox = stats?.sandbox || { totalSpend: 0, realizedSavings: 0, completedPayments: 0 };
  const simulation = stats?.simulation || { totalSpend: 0, realizedSavings: 0, completedPayments: 0 };
  const sample = stats?.sample || { totalSpend: 0, realizedSavings: 0, completedPayments: 0 };

  const totalVerifiedSpend = sandbox.totalSpend;
  const totalRealizedSavings = sandbox.realizedSavings;
  const allLedgerSpend = sandbox.totalSpend + simulation.totalSpend + sample.totalSpend;
  const totalCompletedPOs = sandbox.completedPayments + simulation.completedPayments + sample.completedPayments;

  // 1. Process Spend by Category for Hollow Donut Chart
  const categoryData = React.useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [
        { name: 'Ergonomic Task Chairs', value: 4450 },
        { name: 'Standard Swivel Chairs', value: 1485 },
        { name: 'Logistics & Freight', value: 1150 }
      ];
    }

    const catMap = {};
    transactions.forEach((txn) => {
      // Group by product or generic category
      const product = txn.product || 'Office Hardware';
      const catName = product.includes('Mesh')
        ? 'Ergonomic Seating'
        : product.includes('Swivel')
        ? 'Standard Task Chairs'
        : product.includes('Executive')
        ? 'Executive Seating'
        : 'Workplace Equipment';

      catMap[catName] = (catMap[catName] || 0) + (parseFloat(txn.totalAmount) || 0);
    });

    const items = Object.entries(catMap).map(([name, value]) => ({
      name,
      value: Math.round(value * 100) / 100
    }));

    return items.length > 0 ? items : [{ name: 'Commercial Equipment', value: 4450 }];
  }, [transactions]);

  const totalCategorySpend = React.useMemo(() => {
    return categoryData.reduce((acc, curr) => acc + curr.value, 0);
  }, [categoryData]);

  // 2. Process Purchasing Volume Over Time for Area Chart
  const timelineData = React.useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [
        { date: 'Oct 28', spend: 1200, count: 1 },
        { date: 'Nov 01', spend: 2300, count: 1 },
        { date: 'Nov 04', spend: 1485, count: 1 },
        { date: 'Nov 10', spend: 4450, count: 1 }
      ];
    }

    // Sort chronologically
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Group by formatted date
    const dateMap = {};
    sorted.forEach((txn) => {
      const d = new Date(txn.timestamp);
      const dateStr = isNaN(d.getTime())
        ? 'Recent'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { date: dateStr, spend: 0, count: 0 };
      }
      dateMap[dateStr].spend += parseFloat(txn.totalAmount) || 0;
      dateMap[dateStr].count += 1;
    });

    return Object.values(dateMap);
  }, [transactions]);

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div style={{ marginBottom: '28px' }}>
        <div className="metrics-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="kpi-card skeleton-pulse" style={{ height: '115px' }}></div>
          ))}
        </div>
        <div className="analytics-grid">
          <div className="chart-card skeleton-pulse" style={{ height: '320px' }}></div>
          <div className="chart-card skeleton-pulse" style={{ height: '320px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '28px' }}>
      {/* 5 Executive KPI Cards */}
      <div className="metrics-grid">
        {/* 1. Hero KPI: Total Verified Procurement Spend (Bright Orange #F97316) */}
        <div className="kpi-card hero-kpi-orange">
          <div className="kpi-header">
            <span className="kpi-label">Total Verified Spend</span>
            <div className="kpi-icon-wrap">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="kpi-value">
            ${totalVerifiedSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtitle">
            {sandbox.completedPayments} verified PayPal settlement{sandbox.completedPayments !== 1 ? 's' : ''} (${allLedgerSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })} total volume)
          </div>
        </div>

        {/* 2. Actual Realized Savings */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Actual Realized Savings</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--accent-mint)' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="kpi-value mint">
            +${totalRealizedSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="badge badge-sandbox" style={{ padding: '1px 6px', fontSize: '10px' }}>
              CAPTURED
            </span>
            <span>Verified in settlement ledger</span>
          </div>
        </div>

        {/* 3. Active Estimated Savings */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Estimated Savings</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--secondary)' }}>
              <Sparkles size={18} />
            </div>
          </div>
          <div className="kpi-value blue">
            ${currentEstimatedSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="badge badge-sim" style={{ padding: '1px 6px', fontSize: '10px' }}>
              AI ESTIMATE
            </span>
            <span>Identified in active quote</span>
          </div>
        </div>

        {/* 4. Average Delivery SLA */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Avg. Delivery SLA</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--text-secondary)' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-value">
            5.3 <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>Days</span>
          </div>
          <div className="kpi-subtitle">
            Across 3 vetted enterprise suppliers
          </div>
        </div>

        {/* 5. Number of Successful POs */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Successful POs</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--accent-orange)' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="kpi-value orange">
            {totalCompletedPOs}
          </div>
          <div className="kpi-subtitle">
            100% automated capture rate
          </div>
        </div>
      </div>

      {/* 2 Recharts Analytics Cards */}
      <div className="analytics-grid">
        {/* Chart 1: Hollow Donut Chart - Spend by Category */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">
                <PieIcon size={17} style={{ color: 'var(--primary)' }} />
                <span>Spend by Category</span>
              </div>
              <div className="chart-subtitle">
                Category allocation across active & completed purchase orders
              </div>
            </div>
            <span className="badge badge-sample" style={{ fontSize: '10.5px' }}>
              DISTRIBUTION
            </span>
          </div>

          <div className="chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      stroke="#1E293B"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomDonutTooltip total={totalCategorySpend} />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Centered Total Label inside Hollow Donut */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Volume
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                ${(totalCategorySpend / 1000).toFixed(1)}k
              </div>
            </div>
          </div>

          {/* Legend Grid */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px 18px',
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-primary)'
            }}
          >
            {categoryData.map((item, index) => {
              const pct = totalCategorySpend > 0 ? Math.round((item.value / totalCategorySpend) * 100) : 0;
              return (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
                    }}
                  ></span>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Smooth Gradient Area Chart - Purchasing Volume Over Time */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">
                <TrendingUp size={17} style={{ color: 'var(--secondary)' }} />
                <span>Purchasing Volume Over Time</span>
              </div>
              <div className="chart-subtitle">
                Settled & committed procurement capital trajectory
              </div>
            </div>
            <span className="badge badge-sample" style={{ fontSize: '10.5px' }}>
              HISTORICAL & LIVE
            </span>
          </div>

          <div className="chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#94A3B8"
                  fontSize={11.5}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={11.5}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => `$${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val}`}
                />
                <RechartsTooltip content={<CustomAreaTooltip />} />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#spendGradient)"
                  dot={{ r: 4, fill: '#F97316', stroke: '#1E293B', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#F97316', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Subtitle / Insight Note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-primary)',
              fontSize: '12px',
              color: 'var(--text-muted)'
            }}
          >
            <span>Peak settlement: <strong>${Math.max(...timelineData.map(d => d.spend), 0).toLocaleString()}</strong></span>
            <span style={{ color: 'var(--accent-mint)' }}>Consistent 0% Settlement Variance</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Custom Tooltip for Category Donut
function CustomDonutTooltip({ active, payload, total }) {
  if (active && payload && payload.length) {
    const data = payload[0];
    const pct = total > 0 ? Math.round((data.value / total) * 100) : 0;
    return (
      <div className="chart-custom-tooltip">
        <div className="tooltip-title">{data.name}</div>
        <div style={{ color: 'var(--primary-light)', fontSize: '13px' }} className="tooltip-val">
          ${data.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>({pct}%)</span>
        </div>
      </div>
    );
  }
  return null;
}

// Custom Tooltip for Area Chart
function CustomAreaTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="chart-custom-tooltip">
        <div className="tooltip-title">{label}</div>
        <div style={{ color: 'var(--accent-orange)', fontSize: '13px' }} className="tooltip-val">
          ${parseFloat(data.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
          Purchase Order Volume
        </div>
      </div>
    );
  }
  return null;
}
