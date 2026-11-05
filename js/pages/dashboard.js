/* ============================================
   CV EPIC Warehouse - Dashboard Module
   Final Dashboard V1 - Fixed
   ============================================ */

// Prevent redeclaration - check if already exists
if (typeof window.Dashboard !== 'undefined') {
} else {
  window.Dashboard = {
  data: {},
  charts: {},
  updateInterval: null,
  isLoading: true,
  error: null,
  
  selectedMonth: new Date().getMonth() + 1,
  selectedYear: new Date().getFullYear(),
  
  init() {
    this.showLoadingOverlay();
    this.loadDashboard();
    this.startAutoRefresh();
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 1000);
    this.initFilterDropdowns();
  },
  
  initFilterDropdowns() {
    const bulanSelect = document.getElementById('filterBulan');
    const tahunSelect = document.getElementById('filterTahun');
    
    if (bulanSelect && tahunSelect) {
      bulanSelect.value = this.selectedMonth;
      tahunSelect.value = this.selectedYear;
      
      bulanSelect.addEventListener('change', () => {
        this.selectedMonth = parseInt(bulanSelect.value);
        this.showLoadingOverlay();
        this.loadDashboard();
      });
      
      tahunSelect.addEventListener('change', () => {
        this.selectedYear = parseInt(tahunSelect.value);
        this.showLoadingOverlay();
        this.loadDashboard();
      });
    }
  },
  
  updateDateTime() {
    const now = new Date();
    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    
    const dateEl = document.getElementById('currentDate');
    const timeEl = document.getElementById('currentTime');
    
    if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', dateOptions);
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('id-ID', timeOptions);
  },
  
  showLoadingOverlay() {
    const overlay = document.getElementById('dashboardLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';
  },
  
  hideLoadingOverlay() {
    const overlay = document.getElementById('dashboardLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
  },
  
  showError(message) {
    this.error = message;
    this.isLoading = false;
    this.hideLoadingOverlay();
    
    const dashboard = document.querySelector('.dashboard');
    if (!dashboard) return;
    
    const errorHtml = '<div class="dashboard-error">' +
      '<div class="dashboard-error__icon"><i data-lucide="alert-circle"></i></div>' +
      '<h3 class="dashboard-error__title">Gagal Memuat Dashboard</h3>' +
      '<p class="dashboard-error__message">' + message + '</p>' +
      '<button class="btn btn--primary" onclick="Dashboard.loadDashboard()">' +
      '<i data-lucide="refresh-cw"></i> Coba Lagi</button></div>';
    
    const welcome = dashboard.querySelector('.welcome');
    if (welcome) {
      welcome.insertAdjacentHTML('afterend', errorHtml);
      if (window.lucide) lucide.createIcons();
    }
  },
  
  hideError() {
    const errorEl = document.querySelector('.dashboard-error');
    if (errorEl) errorEl.remove();
  },
  
  async loadDashboard() {
    this.hideError();
    
    try {
      // Run sequentially to preserve charts data
      await this.loadDashboardData();
      await this.loadChartData();
      
      this.isLoading = false;
      this.hideLoadingOverlay();
      this.renderKPIs();
      this.renderCharts();
      this.renderSOProgress();
      this.renderModulLevelTable();
      this.renderStokKritisList();
      this.renderRecentActivity();
      this.renderOutletStats();
      this.updateUserGreeting();
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
      this.showError(error.message || 'Terjadi kesalahan saat memuat data');
    }
  },
  
  async loadDashboardData() {
    try {
      const { selectedMonth, selectedYear } = this;
      const response = await fetch(`/api/v3-dashboard?bulan=${selectedMonth}&tahun=${selectedYear}`);
      if (!response.ok) throw new Error('Gagal memuat data dashboard');
      
      const dashboardData = await response.json();
      // Preserve existing charts data, merge with new dashboard data
      this.data = {
        charts: this.data?.charts || {},
        ...dashboardData
      };
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.data = this.getEmptyData();
      throw error;
    }
  },
  
  async loadChartData() {
    try {
      const { selectedMonth, selectedYear } = this;
      const params = `bulan=${selectedMonth}&tahun=${selectedYear}`;
      
      const [trenResponse, topProdukResponse, outletResponse, modulLevelResponse] = await Promise.all([
        fetch('/api/v3-chart?type=tren_penjualan&' + params),
        fetch('/api/v3-chart?type=top_produk&' + params),
        fetch('/api/v3-chart?type=outlet&' + params),
        fetch('/api/v3-chart?type=modul_level&' + params)
      ]);
      
      const trenData = trenResponse.ok ? await trenResponse.json() : { data: [] };
      const topProdukData = topProdukResponse.ok ? await topProdukResponse.json() : { data: [] };
      const outletData = outletResponse.ok ? await outletResponse.json() : { data: [] };
      const modulLevelData = modulLevelResponse.ok ? await modulLevelResponse.json() : { data: [] };
      
      // API returns { type, periode, data: [...] }, store directly
      this.data.charts = {
        trenPenjualan: trenData,
        topProduk: topProdukData,
        outlet: outletData,
        modulLevel: modulLevelData
      };
      
    } catch (error) {
      console.error('Error loading chart data:', error);
      this.data.charts = { trenPenjualan: { data: [] }, topProduk: { data: [] }, outlet: { data: [] }, modulLevel: { data: [] } };
    }
  },
  
  updateUserGreeting() {
    const authUser = localStorage.getItem('auth_user');
    let userName = 'Admin';
    
    if (authUser) {
      try {
        const user = JSON.parse(authUser);
        userName = user.nama_lengkap || user.username || 'Admin';
      } catch (e) {}
    }
    
    const titleEl = document.getElementById('welcomeTitle');
    if (titleEl) titleEl.textContent = 'Selamat Datang, ' + userName;
  },
  
  getEmptyData() {
    return {
      filter: { bulan: this.selectedMonth, tahun: this.selectedYear },
      periode: { distribusi: { qty: 0 }, penjualan: { qty: 0, nominal: 0 }, profit: 0, total_siswa: 0 },
      outlet_stats: { total: 0, transaksi: 0, non_transaksi: 0, detail: [], non_transaksi_detail: [] },
      produk: { aktif: 0, total: 0 },
      outlet: { aktif: 0, total: 0 },
      stok: { kritis: 0, gudang: { akhir: 0 } },
      opname: { berjalan: 0, selesai_bulan_ini: 0 },
      users: { total: 0 },
      charts: { trenPenjualan: { data: [] }, topProduk: { data: [] }, outlet: { data: [] }, modulLevel: { data: [] } }
    };
  },
  
  renderKPIs() {
    const data = this.data;
    
    this.setKPIValue('kpi-total-produk', this.formatNumber(data.produk?.total || 0));
    this.setKPIValue('kpi-total-outlet', this.formatNumber(data.outlet?.total || 0));
    this.setKPIValue('kpi-stok-gudang', this.formatNumber(data.stok?.gudang?.akhir || 0));
    this.setKPIValue('kpi-stok-outlet', '-');
    
    this.setKPIValue('kpi-distribusi', this.formatNumber(data.periode?.distribusi?.qty || 0));
    this.setKPIValue('kpi-penjualan', 'Rp ' + this.formatNumber(data.periode?.penjualan?.nominal || 0));
    this.setKPIValue('kpi-so-berjalan', this.formatNumber(data.opname?.berjalan || 0));
    this.setKPIValue('kpi-stok-kritis', this.formatNumber(data.stok?.kritis || 0));
    
    this.setKPIValue('kpi-user-aktif', this.formatNumber(data.users?.total || 0));
    this.setKPIValue('kpi-profit', 'Rp ' + this.formatNumber(data.periode?.profit || 0));
    this.setKPIValue('kpi-siswa-aktif', this.formatNumber(data.periode?.total_siswa || 0));
    this.setKPIValue('kpi-produk-aktif', this.formatNumber(data.produk?.aktif || 0));
  },
  
  setKPIValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },
  
  formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },
  
  renderCharts() {
    this.renderTrenPenjualanChart();
    this.renderTopProdukChart();
    this.renderTopOutletChart();
  },
  
  renderTrenPenjualanChart() {
    const canvas = document.getElementById('chartPenjualan');
    const emptyEl = document.getElementById('chartPenjualanEmpty');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (this.charts.penjualan) {
      this.charts.penjualan.destroy();
      this.charts.penjualan = null;
    }
    
    const trenData = this.data.charts?.trenPenjualan?.data || [];
    
    // Nama bulan Indonesia
    const bulanIndonesia = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    
    // Buat array 12 bulan dengan nilai default 0
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      bulan: i + 1,
      value: 0
    }));
    
    // Isi data dari API
    trenData.forEach(item => {
      if (item.bulan && item.bulan >= 1 && item.bulan <= 12) {
        monthlyData[item.bulan - 1].value = item.value;
      }
    });
    
    // Always show chart with all 12 months - never show empty state
    const labels = bulanIndonesia;
    const dataValues = monthlyData.map(d => d.value);
    
    if (emptyEl) emptyEl.style.display = 'none';
    canvas.style.display = 'block';
    
    this.charts.penjualan = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Penjualan',
          data: dataValues,
          borderColor: '#e53935',
          backgroundColor: 'rgba(229, 57, 53, 0.15)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#e53935',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ff5252',
          pointHoverBorderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#e53935',
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: (item) => {
                return 'Rp ' + this.formatRupiah(item.raw);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#94a3b8',
              callback: (value) => 'Rp ' + this.formatRupiah(value)
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  },
  
  formatRupiah(num) {
    if (num === null || num === undefined || num === 0) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },
  
  renderTopProdukChart() {
    const container = document.getElementById('topProdukContainer');
    const emptyEl = document.getElementById('chartTopProdukEmpty');
    if (!container) return;
    
    const topProdukData = this.data.charts?.topProduk?.data || [];
    
    const filteredData = topProdukData.filter(d => d.value > 0).slice(0, 10);
    
    if (!filteredData.length) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    const tableHtml = '<table class="top-produk-table">' +
      '<thead><tr><th>#</th><th>Produk</th><th class="text-right">Qty</th></tr></thead>' +
      '<tbody>' +
      filteredData.map((p, i) => {
        const nama = p.nama_produk || p.label || 'Unknown';
        return '<tr><td class="rank">' + (i + 1) + '</td><td class="produk-nama">' + nama + '</td><td class="text-right qty">' + this.formatNumber(p.value) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
    
    container.innerHTML = tableHtml;
  },
  
  renderTopOutletChart() {
    const container = document.getElementById('topOutletContainer');
    const emptyEl = document.getElementById('chartTopOutletEmpty');
    if (!container) return;
    
    const outletData = this.data.charts?.outlet?.data || [];
    
    const filteredData = outletData.filter(d => d.value > 0).slice(0, 10);
    
    if (!filteredData.length) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    const tableHtml = '<table class="top-outlet-table">' +
      '<thead><tr><th>#</th><th>Nama Outlet</th><th class="text-right">Qty</th></tr></thead>' +
      '<tbody>' +
      filteredData.map((o, i) => {
        const nama = o.label || 'Unknown';
        return '<tr><td class="rank">' + (i + 1) + '</td><td class="outlet-nama">' + nama + '</td><td class="text-right qty">' + this.formatNumber(o.value) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
    
    container.innerHTML = tableHtml;
  },
  
  renderSOProgress() {
    const opname = this.data.opname || {};
    const berjalan = opname.berjalan || 0;
    const selesai = opname.selesai_bulan_ini || 0;
    const total = berjalan + selesai || 1;
    
    const proses = Math.floor(berjalan / 2);
    const menunggu = berjalan - proses;
    
    this.setKPIValue('so-menunggu', menunggu);
    this.setKPIValue('so-proses', proses);
    this.setKPIValue('so-selesai', selesai);
    
    const menungguBar = document.getElementById('so-menunggu-bar');
    const prosesBar = document.getElementById('so-proses-bar');
    const selesaiBar = document.getElementById('so-selesai-bar');
    
    if (menungguBar) menungguBar.style.width = (menunggu / total * 100) + '%';
    if (prosesBar) prosesBar.style.width = (proses / total * 100) + '%';
    if (selesaiBar) selesaiBar.style.width = (selesai / total * 100) + '%';
  },
  
  renderRecentActivity() {
    const container = document.getElementById('aktivitasList');
    if (!container) return;
    
    const data = this.data;
    const activities = [];
    
    if (data.periode?.penjualan?.nominal > 0) {
      activities.push({ text: 'Penjualan: Rp ' + this.formatNumber(data.periode.penjualan.nominal), time: 'Periode ini', type: 'success', icon: 'shopping-cart' });
    }
    
    if (data.periode?.profit > 0) {
      activities.push({ text: 'Profit: Rp ' + this.formatNumber(data.periode.profit), time: 'Periode ini', type: 'info', icon: 'wallet' });
    }
    
    if (data.produk?.aktif > 0) {
      activities.push({ text: data.produk.aktif + ' produk aktif terjual', time: 'Periode ini', type: 'info', icon: 'package' });
    }
    
    if (data.opname?.berjalan > 0) {
      activities.push({ text: data.opname.berjalan + ' SO berjalan', time: 'Aktif', type: 'warning', icon: 'clipboard' });
    }
    
    if (activities.length === 0) {
      activities.push({ text: 'Sistem berjalan normal', time: 'Online', type: 'success', icon: 'check' });
    }
    
    container.innerHTML = activities.slice(0, 5).map(item => {
      return '<div class="activity-item">' +
        '<div class="activity-item__icon activity-item__icon--' + item.type + '"><i data-lucide="' + item.icon + '"></i></div>' +
        '<div class="activity-item__content">' +
        '<div class="activity-item__text">' + item.text + '</div>' +
        '<div class="activity-item__time">' + item.time + '</div>' +
        '</div></div>';
    }).join('');
    
    if (window.lucide) lucide.createIcons({ nodes: [container] });
  },
  
  renderModulLevelTable() {
    const container = document.getElementById('modulLevelTable');
    if (!container) return;
    
    const modulLevelResponse = this.data.charts?.modulLevel;
    const modulData = modulLevelResponse?.data || [];
    
    // Define all expected levels
    const expectedLevels = [
      { label: 'Membaca', level: 1 },
      { label: 'Membaca', level: 2 },
      { label: 'Membaca', level: 3 },
      { label: 'Expro PU', level: 1 },
      { label: 'Expro PU', level: 2 },
      { label: 'Expro MD', level: 1 },
      { label: 'Expro MD', level: 2 },
      { label: 'Expro MD', level: 3 },
      { label: 'Expro MD', level: 4 }
    ];
    
    // Map data to lookup
    const dataMap = {};
    modulData.forEach(item => {
      const key = item.label + '|' + item.level_num;
      dataMap[key] = item.value || 0;
    });
    
    // Build rows with all levels
    const rows = expectedLevels.map(exp => {
      const key = exp.label + '|' + exp.level;
      const qty = dataMap[key] || 0;
      return {
        label: exp.label,
        level: 'Level ' + exp.level,
        value: qty
      };
    });
    
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    
    const tableHtml = '<div class="modul-level-table-wrapper">' +
      '<table class="modul-level-table">' +
      '<thead><tr><th>Jenis Modul</th><th>Level</th><th class="text-right">Qty Terjual</th></tr></thead>' +
      '<tbody>' +
      rows.map(item => {
        return '<tr><td class="modul-jenis">' + item.label + '</td><td class="modul-level">' + item.level + '</td><td class="modul-qty text-right">' + this.formatNumber(item.value) + '</td></tr>';
      }).join('') +
      '</tbody>' +
      '<tfoot><tr><td colspan="2" class="text-right"><strong>Total:</strong></td><td class="text-right"><strong>' + this.formatNumber(total) + '</strong></td></tr></tfoot>' +
      '</table></div>';
    
    container.innerHTML = tableHtml;
  },
  
  renderStokKritisList() {
    const container = document.getElementById('stokKritisList');
    if (!container) return;
    
    const stokList = this.data.stok?.kritis_list || [];
    
    if (!stokList.length) {
      container.innerHTML = '<div class="table-card__empty"><i data-lucide="check-circle"></i><p class="table-card__empty-text">Tidak ada stok kritis</p></div>';
      if (window.lucide) lucide.createIcons({ nodes: [container] });
      return;
    }
    
    const listHtml = stokList.map(item => {
      const isZero = item.stok <= 0;
      return '<div class="stok-item">' +
        '<div class="stok-item__info">' +
          '<span class="stok-item__sku">' + item.sku + '</span>' +
          '<span class="stok-item__nama">' + item.nama_produk + '</span>' +
        '</div>' +
        '<div class="stok-item__stock">' +
          '<span class="stok-item__qty">' + this.formatNumber(item.stok) + '</span>' +
          (isZero ? '<span class="badge badge--danger">Habis</span>' : '<span class="badge badge--warning">Kritis</span>') +
        '</div>' +
      '</div>';
    }).join('');
    
    container.innerHTML = listHtml;
  },
  
  renderOutletStats() {
    const container = document.getElementById('outletStatsTable');
    const totalEl = document.getElementById('outlet-total');
    const transaksiEl = document.getElementById('outlet-transaksi');
    const nonTransaksiEl = document.getElementById('outlet-non-transaksi');
    if (!container) return;
    
    const outletStats = this.data.outlet_stats || {};
    const filter = document.getElementById('outletStatsFilter')?.value || 'all';
    
    // Update summary badges
    if (totalEl) totalEl.textContent = this.formatNumber(outletStats.total || 0);
    if (transaksiEl) transaksiEl.textContent = this.formatNumber(outletStats.transaksi || 0);
    if (nonTransaksiEl) nonTransaksiEl.textContent = this.formatNumber(outletStats.non_transaksi || 0);
    
    // Filter data based on selection
    let data = [];
    if (filter === 'transaksi') {
      data = outletStats.detail || [];
    } else if (filter === 'non-transaksi') {
      data = (outletStats.non_transaksi_detail || []).map(o => ({
        ...o,
        total_qty: 0,
        jumlah_transaksi: 0
      }));
    } else {
      // All outlets - combine transaksi and non-transaksi
      const transaksiData = (outletStats.detail || []).map(o => ({
        ...o,
        status: 'Transaksi'
      }));
      const nonTransaksiData = (outletStats.non_transaksi_detail || []).map(o => ({
        ...o,
        total_qty: 0,
        jumlah_transaksi: 0,
        status: 'Non Transaksi'
      }));
      data = [...transaksiData, ...nonTransaksiData].sort((a, b) => {
        if (a.status === 'Transaksi' && b.status !== 'Transaksi') return -1;
        if (a.status !== 'Transaksi' && b.status === 'Transaksi') return 1;
        return (b.total_qty || 0) - (a.total_qty || 0);
      });
    }
    
    if (!data.length) {
      container.innerHTML = '<div class="table-card__empty"><i data-lucide="store"></i><p class="table-card__empty-text">Tidak ada data outlet</p></div>';
      if (window.lucide) lucide.createIcons({ nodes: [container] });
      return;
    }
    
    // Check if showing transaksi data
    const showDetail = filter !== 'non-transaksi';
    
    let tableHtml = '<table class="outlet-stats-table">' +
      '<thead><tr>' +
      '<th>#</th><th>Nama Outlet</th>';
    
    if (showDetail) {
      tableHtml += '<th class="text-right">Jumlah Transaksi</th><th class="text-right">Total Qty</th>';
    }
    tableHtml += '<th>Status</th></tr></thead><tbody>';
    
    data.forEach((item, i) => {
      const status = item.status || (Number(item.total_qty) > 0 ? 'Transaksi' : 'Non Transaksi');
      const statusClass = status === 'Transaksi' ? 'badge--success' : 'badge--secondary';
      
      tableHtml += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + (item.nama_outlet || '-') + '</td>';
      
      if (showDetail) {
        tableHtml += '<td class="text-right">' + this.formatNumber(item.jumlah_transaksi || 0) + '</td>' +
          '<td class="text-right">' + this.formatNumber(item.total_qty || 0) + '</td>';
      }
      
      tableHtml += '<td><span class="badge ' + statusClass + '">' + status + '</span></td></tr>';
    });
    
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
  },
  
  exportOutletStats(format) {
    const outletStats = this.data.outlet_stats || {};
    const filter = document.getElementById('outletStatsFilter')?.value || 'all';
    const { selectedMonth, selectedYear } = this;
    
    // Prepare data based on filter
    let data = [];
    let filename = 'outlet_stats_';
    
    if (filter === 'transaksi') {
      data = (outletStats.detail || []).map(o => ({
        nama_outlet: o.nama_outlet,
        jumlah_transaksi: o.jumlah_transaksi,
        total_qty: o.total_qty,
        status: 'Transaksi'
      }));
      filename += 'transaksi';
    } else if (filter === 'non-transaksi') {
      data = (outletStats.non_transaksi_detail || []).map(o => ({
        nama_outlet: o.nama_outlet,
        jumlah_transaksi: 0,
        total_qty: 0,
        status: 'Non Transaksi'
      }));
      filename += 'non_transaksi';
    } else {
      // All outlets
      const transaksiData = (outletStats.detail || []).map(o => ({
        nama_outlet: o.nama_outlet,
        jumlah_transaksi: o.jumlah_transaksi,
        total_qty: o.total_qty,
        status: 'Transaksi'
      }));
      const nonTransaksiData = (outletStats.non_transaksi_detail || []).map(o => ({
        nama_outlet: o.nama_outlet,
        jumlah_transaksi: 0,
        total_qty: 0,
        status: 'Non Transaksi'
      }));
      data = [...transaksiData, ...nonTransaksiData];
      filename += 'semua';
    }
    
    // Add month/year to filename
    const bulanNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    filename += '_' + bulanNames[selectedMonth] + '_' + selectedYear;
    
    if (format === 'csv') {
      this.exportOutletStatsToCSV(data, filename + '.csv');
    } else if (format === 'xlsx') {
      this.exportOutletStatsToExcel(data, filename + '.xlsx');
    }
  },
  
  exportOutletStatsToCSV(data, filename) {
    if (!data.length) {
      alert('Tidak ada data untuk diekspor');
      return;
    }
    
    const headers = ['No', 'Nama Outlet', 'Jumlah Transaksi', 'Total Qty', 'Status'];
    const rows = data.map((item, i) => [
      i + 1,
      item.nama_outlet || '',
      item.jumlah_transaksi || 0,
      item.total_qty || 0,
      item.status || ''
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  },
  
  exportOutletStatsToExcel(data, filename) {
    if (!data.length) {
      alert('Tidak ada data untuk diekspor');
      return;
    }
    
    const headers = ['No', 'Nama Outlet', 'Jumlah Transaksi', 'Total Qty', 'Status'];
    const rows = data.map((item, i) => [
      i + 1,
      item.nama_outlet || '',
      item.jumlah_transaksi || 0,
      item.total_qty || 0,
      item.status || ''
    ]);
    
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<head><meta charset="utf-8"><style>td{mso-number-format:\\@;}</style></head>' +
      '<body><table border="1">' +
      '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>' +
      rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') +
      '</table></body></html>';
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  },
  
  startAutoRefresh() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = setInterval(() => {
      this.showLoadingOverlay();
      this.loadDashboard();
    }, 5 * 60 * 1000);
  },
  
  stopAutoRefresh() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  },
  
  destroy() {
    this.stopAutoRefresh();
    Object.values(this.charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    this.charts = {};
  }
};

function initDashboard() {
  if (window.Dashboard && typeof window.Dashboard.init === 'function') {
    if (window.Dashboard.stopAutoRefresh) window.Dashboard.stopAutoRefresh();
    window.Dashboard.init();
  }
}
} // end else block

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  if (document.getElementById('kpi-total-produk')) initDashboard();
}