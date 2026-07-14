/***********************************************
 * CV EPIC Warehouse - Client-Side Router
 * SPA Page Navigation
 ***********************************************/

const AppRouter = {
  // Route configuration
  routes: {
    'dashboard': 'pages/dashboard.html',
    'produk': 'pages/produk.html',
    'penjualan': 'pages/penjualan.html',
    'pembelian': 'pages/pembelian.html',
    'persediaan': 'pages/persediaan.html',
    'forecasting': 'pages/forecasting.html',
    'dashboard-so': 'pages/dashboard-so.html',
    'perintah-so': 'pages/perintah-so.html',
    'pelaksanaan-so': 'pages/pelaksanaan-so.html',
    'task-saya': 'pages/task-saya.html',
    'riwayat-so': 'pages/riwayat-so.html',
    'penyesuaian-stok': 'pages/penyesuaian-stok.html',
    'monitoring-outlet': 'pages/monitoring-outlet.html',
    'laporan': 'pages/laporan.html',
    'user': 'pages/user.html',
    'pengaturan': 'pages/pengaturan.html',
    'stok-gudang': 'pages/stok-gudang.html'
  },
  
  currentPage: 'dashboard',
  loadedPages: {},
  
  init() {
    this.handleRoute();
    window.addEventListener('popstate', () => this.handleRoute());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-page]');
      if (link) {
        e.preventDefault();
        this.navigateTo(link.dataset.page);
      }
    });
    console.log('AppRouter initialized');
  },
  
  navigateTo(page, replace = false) {
    if (!this.routes[page]) {
      console.warn('Route not found:', page);
      page = 'dashboard';
    }
    
    // Clear cache for current page to ensure clean state
    if (this.loadedPages[this.currentPage]) {
      delete this.loadedPages[this.currentPage];
    }
    
    this.currentPage = page;
    const url = window.location.pathname + '?page=' + page;
    if (replace) {
      history.replaceState({ page }, '', url);
    } else {
      history.pushState({ page }, '', url);
    }
    this.updateActiveMenu(page);
    this.loadPage(page);
  },
  
  handleRoute() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page') || 'dashboard';
    this.currentPage = page;
    this.updateActiveMenu(page);
    this.loadPage(page);
  },
  
  updateActiveMenu(page) {
    document.querySelectorAll('.sidebar__link').forEach(item => {
      item.classList.remove('active');
    });
    const menuItem = document.querySelector('.sidebar__link[data-page="' + page + '"]');
    if (menuItem) menuItem.classList.add('active');
    this.updatePageTitle(page);
  },
  
  updatePageTitle(page) {
    const titles = {
      'dashboard': 'Dashboard',
      'produk': 'Produk',
      'penjualan': 'Penjualan',
      'pembelian': 'Pembelian',
      'persediaan': 'Persediaan',
      'forecasting': 'Forecasting',
      'dashboard-so': 'Dashboard SO',
      'perintah-so': 'Perintah SO',
      'pelaksanaan-so': 'Pelaksanaan SO',
      'task-saya': 'Task Saya',
      'riwayat-so': 'Riwayat SO',
      'penyesuaian-stok': 'Penyesuaian Stok',
      'monitoring-outlet': 'Monitoring Outlet',
      'laporan': 'Laporan',
      'user': 'Manajemen User',
      'pengaturan': 'Pengaturan',
      'stok-gudang': 'Stok Gudang'
    };
    document.title = 'CV EPIC Warehouse - ' + (titles[page] || 'Dashboard');
  },
  
  async loadPage(page, forceReload = false) {
    const container = document.getElementById('pageContainer');
    if (!container) {
      console.error('Page container not found');
      return;
    }
    
    // Always reload SO pages to ensure data consistency
    const soPages = ['perintah-so', 'riwayat-so', 'pelaksanaan-so', 'task-saya', 'dashboard-so', 'penyesuaian-stok'];
    const shouldReload = forceReload || soPages.includes(page);
    
    if (this.loadedPages[page] && !shouldReload) {
      // Clone the cached content to avoid mutating the cache
      container.innerHTML = '';
      container.appendChild(this.loadedPages[page].cloneNode(true));
      this.initPage(page);
      console.log('Page loaded from cache:', page);
      return;
    }
    
    container.innerHTML = '<div class="page-loading"><div class="page-loading__spinner"></div><p>Memuat halaman...</p></div>';
    
    try {
      const response = await fetch(this.routes[page] + '?t=' + Date.now());
      if (!response.ok) throw new Error('Failed to load page: ' + response.status);
      
      const html = await response.text();
      container.innerHTML = html;
      this.executeScripts(container);
      
      // Clone the executed DOM for cache (preserves data-executed attributes)
      this.loadedPages[page] = container.cloneNode(true);
      
      this.initPage(page);
      console.log('Page loaded:', page);
    } catch (error) {
      console.error('Error loading page', page, error);
      container.innerHTML = '<div class="page-error"><i data-lucide="alert-circle"></i><h2>Gagal memuat halaman</h2><p>' + error.message + '</p><button class="btn btn--primary" onclick="AppRouter.loadPage(\'' + page + '\')"><i data-lucide="refresh-cw"></i><span>Coba Lagi</span></button></div>';
      if (window.lucide) lucide.createIcons();
    }
  },
  
  executeScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  },
  
  initPage(page) {
    if (window.lucide) lucide.createIcons();
    
    // Dispatch page-specific event for clean re-initialization
    window.dispatchEvent(new CustomEvent('pageInit', { detail: { page } }));
    
    // Call page-specific init functions - each handles its own cleanup
    if (page === 'dashboard' && typeof initDashboard === 'function') initDashboard();
    if (page === 'user' && typeof initUserManagement === 'function') initUserManagement();
    if (page === 'persediaan' && typeof initPersediaanPage === 'function') initPersediaanPage();
    if (page === 'penjualan' && typeof initPenjualanPage === 'function') initPenjualanPage();
    if (page === 'pembelian' && typeof initPembelianPage === 'function') initPembelianPage();
    
    // SO Pages - reload data when returning from cache
    if (page === 'dashboard-so' && typeof loadDashboardSO === 'function') loadDashboardSO();
    if (page === 'perintah-so' && typeof loadPerintah === 'function') loadPerintah();
    if (page === 'pelaksanaan-so' && typeof SOPelaksanaanInit === 'function') SOPelaksanaanInit();
    if (page === 'task-saya' && typeof loadTaskList === 'function') loadTaskList();
    if (page === 'riwayat-so' && typeof loadHistory === 'function') loadHistory();
    if (page === 'penyesuaian-stok' && typeof loadAdjustmentList === 'function') loadAdjustmentList();
    
    window.dispatchEvent(new CustomEvent('pageLoaded', { detail: { page } }));
  },
  
  getCurrentPage() { return this.currentPage; },
  isPageLoaded(page) { return !!this.loadedPages[page]; },
  reloadCurrentPage() { delete this.loadedPages[this.currentPage]; this.loadPage(this.currentPage); },
  clearCache() { this.loadedPages = {}; }
};

window.AppRouter = AppRouter;
document.addEventListener('DOMContentLoaded', () => AppRouter.init());
