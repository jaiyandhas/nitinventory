export const formatCurrency = (amount?: number | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00L';
  return `₹${(amount / 100000).toFixed(2)}L`;
};
