/**
 * Shared Utilities for CV EPIC Warehouse
 * These utilities are loaded globally and available to all pages
 */

// Format number with thousand separator
window.formatNumber = function(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return parseInt(num).toLocaleString('id-ID');
};

// Format currency (Rupiah)
window.formatCurrency = function(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Rp 0';
  return 'Rp ' + parseInt(num).toLocaleString('id-ID');
};

// Format date to Indonesian format
window.formatDate = function(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('id-ID', options);
};

// Get month name in Indonesian
window.getMonthName = function(month) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return months[parseInt(month) - 1] || '-';
};

// Debounce function
window.debounce = function(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Escape HTML to prevent XSS
window.escapeHtml = function(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};
