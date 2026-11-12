import React, { useState, useRef, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { Receipt, Download, Search } from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule]);

export default function LedgerGrid({ transactions = [] }) {
  const gridRef = useRef(null);
  const [quickFilterText, setQuickFilterText] = useState('');

  // Column Definitions
  const columnDefs = useMemo(() => [
    {
      headerName: "Transaction ID",
      field: "transactionId",
      pinned: "left",
      width: 175,
      cellRenderer: (params) => (
        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--primary-light)' }}>
          {params.value}
        </span>
      )
    },
    {
      headerName: "Payment Mode",
      field: "paymentMode",
      width: 175,
      cellRenderer: (params) => {
        const mode = params.value;
        if (mode === 'SANDBOX_VERIFIED') {
          return (
            <span className="badge badge-sandbox" style={{ fontSize: '11px', padding: '2px 8px' }}>
              ● SANDBOX
            </span>
          );
        }
        if (mode === 'SIMULATION') {
          return (
            <span className="badge badge-sim" style={{ fontSize: '11px', padding: '2px 8px' }}>
              ● SIMULATED
            </span>
          );
        }
        return (
          <span className="badge badge-sample" style={{ fontSize: '11px', padding: '2px 8px' }}>
            ● SAMPLE DATA
          </span>
        );
      }
    },
    {
      headerName: "Status",
      field: "paymentStatus",
      width: 130,
      cellRenderer: (params) => {
        const isOk = params.value === 'COMPLETED';
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 600,
            fontSize: '12px',
            color: isOk ? 'var(--accent-mint)' : 'var(--danger)'
          }}>
            {isOk ? '✓ Settled' : params.value}
          </span>
        );
      }
    },
    {
      headerName: "Date & Time",
      field: "timestamp",
      width: 170,
      valueFormatter: (params) => {
        if (!params.value) return '';
        const d = new Date(params.value);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    },
    {
      headerName: "Supplier",
      field: "supplierName",
      width: 220
    },
    {
      headerName: "Product",
      field: "product",
      width: 200
    },
    {
      headerName: "Qty",
      field: "quantity",
      width: 90,
      type: "numericColumn"
    },
    {
      headerName: "Unit Price",
      field: "unitPrice",
      width: 110,
      type: "numericColumn",
      valueFormatter: (params) => `$${Number(params.value || 0).toFixed(2)}`
    },
    {
      headerName: "Total Amount",
      field: "totalAmount",
      width: 140,
      type: "numericColumn",
      cellRenderer: (params) => (
        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
          ${Number(params.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      headerName: "Estimated Savings",
      field: "estimatedSavings",
      width: 150,
      type: "numericColumn",
      cellRenderer: (params) => {
        const val = Number(params.value || 0);
        return (
          <span className="font-mono" style={{ color: val > 0 ? 'var(--primary-light)' : 'var(--text-muted)' }}>
            ${val.toFixed(2)}
          </span>
        );
      }
    },
    {
      headerName: "Realized Savings",
      field: "realizedSavings",
      width: 155,
      type: "numericColumn",
      cellRenderer: (params) => {
        const val = Number(params.value || 0);
        return (
          <span className="font-mono" style={{ fontWeight: 700, color: val > 0 ? 'var(--accent-mint)' : 'var(--text-muted)' }}>
            {val > 0 ? `+$${val.toFixed(2)}` : '$0.00'}
          </span>
        );
      }
    },
    {
      headerName: "PayPal Order ID",
      field: "paypalOrderId",
      width: 190,
      cellRenderer: (params) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {params.value}
        </span>
      )
    },
    {
      headerName: "PayPal Capture ID",
      field: "paypalCaptureId",
      width: 190,
      cellRenderer: (params) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {params.value}
        </span>
      )
    }
  ], []);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true
  }), []);

  const onExportCsv = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `ProcurePal_Matrix_Audit_Ledger_${new Date().toISOString().slice(0, 10)}.csv`
      });
    }
  }, []);

  return (
    <section className="ledger-section" id="ledger-section">
      <div className="ledger-toolbar">
        <div>
          <h2 className="section-title">
            <Receipt size={22} style={{ color: 'var(--primary)' }} />
            Financial Audit Ledger
          </h2>
          <p className="section-subtitle">
            Monitor verified PayPal settlements, simulated transactions, and sample benchmarks.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="ledger-search-box">
            <Search size={14} className="ledger-search-icon" />
            <input
              type="text"
              placeholder="Search audit ledger..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
            />
          </div>

          <button type="button" className="btn-secondary" onClick={onExportCsv}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid-container ag-theme-quartz-dark">
        <AgGridReact
          ref={gridRef}
          rowData={transactions}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
        />
      </div>
    </section>
  );
}
