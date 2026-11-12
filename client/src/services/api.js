import axios from 'axios';

const API_BASE = '/api';

export const api = {
  // Backend Health & Configuration
  getHealth: async () => {
    const res = await axios.get(`${API_BASE}/health`);
    return res.data;
  },

  // Supplier Catalog
  getSuppliers: async (category = '') => {
    const res = await axios.get(`${API_BASE}/suppliers`, { params: { category } });
    return res.data;
  },

  // Ledger Transactions
  getTransactions: async () => {
    const res = await axios.get(`${API_BASE}/ledger/transactions`);
    return res.data;
  },

  // Aggregated Financial Metrics
  getStats: async () => {
    const res = await axios.get(`${API_BASE}/ledger/stats`);
    return res.data;
  },

  // AI Procurement Copilot
  runProcureAgent: async (prompt) => {
    const res = await axios.post(`${API_BASE}/agent/procure`, { prompt });
    return res.data;
  },

  // PayPal Orders API v2
  createOrder: async (supplierId, quantity, maxBudget, forceSimulation = false) => {
    const res = await axios.post(`${API_BASE}/paypal/create-order`, {
      supplierId,
      quantity,
      maxBudget,
      forceSimulation
    });
    return res.data;
  },

  captureOrder: async (orderID, procurementMetadata) => {
    const res = await axios.post(`${API_BASE}/paypal/capture-order`, {
      orderID,
      procurementMetadata
    });
    return res.data;
  },

  // Simulation Fallback
  simulatePayment: async (payload) => {
    const res = await axios.post(`${API_BASE}/ledger/simulate-payment`, payload);
    return res.data;
  }
};

