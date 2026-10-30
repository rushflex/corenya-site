(async function () {
  let site;
  try { site = await CV.boot(); } catch { site = CV.site; }

  const loginView = document.getElementById('loginView');
  const adminView = document.getElementById('adminView');
  if (!loginView || !adminView) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const TITLES = {
    dashboard: ['Genel Bakış', 'Sunucunun nabzını buradan tut.'],
    applications: ['Başvurular', 'Destek ve medya başvurularını incele, onayla veya reddet.'],
    orders: ['Siparişler', 'Mağaza siparişlerini ve teslimat durumlarını yönet.'],
    players: ['Oyuncular', 'Baltop ve ELO verilerini düzenle.'],
    products: ['Ürünler', 'Mağaza ürünlerini, fiyatları ve görünürlüğü yönet.'],
    settings: ['Ayarlar', 'Site, sunucu, güvenlik ve yedekleme ayarları.']
  };

  const state = {
    tab: 'dashboard',
    counts: { pendingApplications: 0, pendingOrders: 0 },
    appFilter: { type: 'all', status: 'all', q: '' },
    orderFilter: { status: 'all', q: '' },
    playerQuery: '',
    apps: new Map(),
    products: [],
    settings: null,
    users: new Map()
  };

  const METHOD_LABELS = { papara: 'Papara', kart: 'Kredi Kartı', havale: 'Havale', discord: 'Discord' };
  const typeLabel = (app) => (app.type === 'media' ? 'Medya' : 'Destek');

  /* ---------------- oturum ---------------- */

  function showLogin(message) {
    loginView.hidden = false;
    adminView.hidden = true;
    if (message) CV.toast(message, 'warn');
    setTimeout(() => $('#loginUser')?.focus(), 80);
  }

  function showApp() {
    loginView.hidden = true;
    adminView.hidden = false;
    bootRoute();
  }

  async function checkSession() {
    if (!API.token) return showLogin();
    try {
      const me = await API.adminGet('/auth/me');
      $('#adminUser').textContent = me.username;
      showApp();
    } catch {
      API.clearToken();
      showLogin();
    }
  }

  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = $('#loginUser').value.trim();
    const password = $('#loginPass').value;
    const error = $('#loginError');
    const button = $('#loginBtn');
    error.style.display = 'none';
    button.disabled = true;
    button.textContent = 'Giriş yapılıyor…';
    try {
      const data = await API.post('/auth/login', { username, password });
      API.setToken(data.token);
      $('#adminUser').textContent = data.username;
      showApp();
      CV.toast('Hoş geldin, ' + data.username + '!', 'success');
    } catch (err) {
      error.textContent = err.message;
      error.style.display = 'flex';
      $('#loginPass').select();
    } finally {
      button.disabled = false;
      button.textContent = 'Giriş Yap';
    }
  });

  async function logout(silent = false) {
    try { await API.post('/auth/logout'); } catch { /* yoksay */ }
    API.clearToken();
    showLogin(silent ? null : 'Çıkış yapıldı.');
    $('#loginForm')?.reset();
  }

  $('#logoutBtn')?.addEventListener('click', () => logout());
  $('#logoutBtn2')?.addEventListener('click', () => logout());

  /* ---------------- yönlendirme ---------------- */

  function setTab(tab) {
    if (!TITLES[tab]) tab = 'dashboard';
    state.tab = tab;
    $$('.admin-nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    $('#adminTitle').textContent = TITLES[tab][0];
    $('#adminSub').textContent = TITLES[tab][1];
    if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
    render();
  }

  function bootRoute() {
    const tab = (location.hash || '#dashboard').slice(1);
    setTab(TITLES[tab] ? tab : 'dashboard');
  }

  window.addEventListener('hashchange', () => {
    if (adminView.hidden) return;
    const tab = (location.hash || '#dashboard').slice(1);
    setTab(TITLES[tab] ? tab : 'dashboard');
  });

  $$('.admin-nav button').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  $('#refreshBtn')?.addEventListener('click', () => {
    CV.toast('Yenileniyor…', 'info', 1200);
    render();
    refreshCounts();
  });

  async function refreshCounts() {
    try {
      const data = await API.adminGet('/admin/overview');
      state.counts = data.counts;
      const apps = $('#countApps');
      const orders = $('#countOrders');
      if (apps) {
        apps.textContent = data.counts.pendingApplications || '';
        apps.hidden = !data.counts.pendingApplications;
      }
      if (orders) {
        orders.textContent = data.counts.pendingOrders || '';
        orders.hidden = !data.counts.pendingOrders;
      }
      state.settings = data.settings;
    } catch { /* yoksay */ }
  }

  /* ---------------- render ---------------- */

  async function render() {
    const host = $('#adminContent');
    if (!host) return;
    host.innerHTML = '<div class="admin-panel"><div class="empty-state"><div class="big">⏳</div>Yükleniyor…</div></div>';
    try {
      if (state.tab === 'dashboard') await renderDashboard(host);
      else if (state.tab === 'applications') await renderApplications(host);
      else if (state.tab === 'orders') await renderOrders(host);
      else if (state.tab === 'players') await renderPlayers(host);
      else if (state.tab === 'products') await renderProducts(host);
      else if (state.tab === 'settings') await renderSettings(host);
    } catch (error) {
      host.innerHTML = `<div class="admin-panel"><div class="store-notice danger" style="margin:0">${CV.esc(error.message)}</div></div>`;
      if (error.status === 401) { API.clearToken(); showLogin('Oturum süresi doldu.'); }
    }
  }

  /* ---------------- panel: genel bakış ---------------- */

  async function renderDashboard(host) {
    const data = await API.adminGet('/admin/overview');
    state.counts = data.counts;
    state.settings = data.settings;
    refreshCounts();

    const stat = (icon, label, value, sub) => `
      <div class="admin-card">
        <div class="a-ico">${icon}</div>
        <small>${label}</small>
        <strong>${value}</strong>
        <div class="sub">${sub}</div>
      </div>`;

    host.innerHTML = `
      <div class="admin-cards">
        ${stat('📨', 'Bekleyen başvuru', CV.num(data.counts.pendingApplications), `${CV.num(data.counts.applications)} toplam başvuru`)}
        ${stat('🛒', 'Bekleyen sipariş', CV.num(data.counts.pendingOrders), `${CV.num(data.counts.orders)} toplam sipariş`)}
        ${stat('💰', 'Toplam ciro', CV.money(data.revenue), `Bugün ${CV.money(data.todayRevenue)}`)}
        ${stat('👥', 'Kayıtlı oyuncu', CV.num(data.counts.players), `${CV.num(site.settings.online)} çevrimiçi`)}
      </div>

      <div class="admin-panel">
        <div class="admin-panel-head">
          <div><h2>Son başvurular</h2><p>Onay bekleyenler önce gösterilir.</p></div>
          <button class="btn btn-ghost btn-sm" data-goto="applications">Tümünü gör →</button>
        </div>
        <div class="admin-table-wrap">
          <table class="mini-table">
            <thead><tr><th>Kod</th><th>Tür</th><th>Başvuran</th><th>Konu</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              ${data.recentApplications.map((app) => {
                state.apps.set(app.id, app);
                return `<tr>
                  <td class="mono">${CV.esc(app.code)}</td>
                  <td>${typeLabel(app)}</td>
                  <td><b>${CV.esc(app.nick)}</b></td>
                  <td class="muted">${CV.esc(app.subject || (CV.PLATFORMS[app.platform] || 'Medya'))}</td>
                  <td>${CV.statusBadge(app.status)}</td>
                  <td style="text-align:right"><button class="btn btn-soft btn-sm" data-review="${CV.esc(app.id)}">İncele</button></td>
                </tr>`;
              }).join('') || '<tr><td colspan="6"><div class="empty-state">Henüz başvuru yok.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-panel">
        <div class="admin-panel-head">
          <div><h2>Son siparişler</h2><p>Mağaza hareketleri.</p></div>
          <button class="btn btn-ghost btn-sm" data-goto="orders">Tümünü gör →</button>
        </div>
        <div class="admin-table-wrap">
          <table class="mini-table">
            <thead><tr><th>Kod</th><th>Oyuncu</th><th>Ürünler</th><th class="num">Tutar</th><th>Durum</th></tr></thead>
            <tbody>
              ${data.recentOrders.map((order) => `<tr>
                <td class="mono">${CV.esc(order.code)}</td>
                <td><b>${CV.esc(order.nick)}</b></td>
                <td class="muted">${CV.esc(order.items.map((i) => `${i.name} ×${i.qty}`).join(', '))}</td>
                <td class="num">${CV.money(order.total)}</td>
                <td>${CV.statusBadge(order.status)}</td>
              </tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Henüz sipariş yok.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-panel">
        <div class="admin-panel-head"><div><h2>Hızlı işlemler</h2><p>Sık kullanılan bölümlere geç.</p></div></div>
        <div class="flex gap-8" style="flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-goto="applications">Başvuruları yönet</button>
          <button class="btn btn-ghost btn-sm" data-goto="orders">Siparişler</button>
          <button class="btn btn-ghost btn-sm" data-goto="players">Oyuncu verileri</button>
          <button class="btn btn-ghost btn-sm" data-goto="products">Ürünler</button>
        </div>
      </div>`;

    $$('[data-goto]', host).forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.goto)));
    $$('[data-review]', host).forEach((btn) => btn.addEventListener('click', () => {
      const app = state.apps.get(btn.dataset.review);
      if (app) openApplication(app);
    }));
  }

  /* ---------------- panel: başvurular ---------------- */

  function ensureAppFilters() {
    return `
      <div class="admin-toolbar">
        <div class="filter-chips" id="appTypeChips">
          <button class="chip ${state.appFilter.type === 'all' ? 'active' : ''}" data-type="all">Tümü</button>
          <button class="chip ${state.appFilter.type === 'support' ? 'active' : ''}" data-type="support">Destek</button>
          <button class="chip ${state.appFilter.type === 'media' ? 'active' : ''}" data-type="media">Medya</button>
        </div>
        <select class="input input-sm" id="appStatus" style="width:auto">
          ${['all', 'pending', 'approved', 'rejected'].map((s) => `<option value="${s}" ${state.appFilter.status === s ? 'selected' : ''}>${s === 'all' ? 'Tüm durumlar' : CV.statusLabel(s)}</option>`).join('')}
        </select>
        <input class="input input-sm grow" id="appSearch" placeholder="Nick, kod veya konu ara…" value="${CV.esc(state.appFilter.q)}">
      </div>`;
  }

  async function renderApplications(host) {
    host.innerHTML = `<div class="admin-panel">
      <div class="admin-panel-head"><div><h2>Başvuru listesi</h2><p>Onayladığında yanıtı kullanıcı takip ekranında görür.</p></div></div>
      ${ensureAppFilters()}
      <div id="appTableWrap"><div class="empty-state">Yükleniyor…</div></div>
    </div>`;

    bindAppFilters(host);
    await loadApplicationsTable();
  }

  function bindAppFilters(host) {
    $$('#appTypeChips .chip', host).forEach((chip) => chip.addEventListener('click', () => {
      state.appFilter.type = chip.dataset.type;
      $$('#appTypeChips .chip', host).forEach((c) => c.classList.toggle('active', c === chip));
      loadApplicationsTable();
    }));
    $('#appStatus', host)?.addEventListener('change', (event) => {
      state.appFilter.status = event.target.value;
      loadApplicationsTable();
    });
    let timer;
    $('#appSearch', host)?.addEventListener('input', (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.appFilter.q = event.target.value.trim();
        loadApplicationsTable();
      }, 250);
    });
  }

  async function loadApplicationsTable() {
    const wrap = $('#appTableWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
    try {
      const params = new URLSearchParams(state.appFilter);
      const data = await API.adminGet(`/admin/applications?${params}`);
      data.applications.forEach((app) => state.apps.set(app.id, app));
      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="mini-table">
            <thead><tr><th>Kod</th><th>Tür</th><th>Başvuran</th><th>Konu</th><th>Öncelik</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
            <tbody>
              ${data.applications.map((app) => `<tr>
                <td class="mono">${CV.esc(app.code)}</td>
                <td>${typeLabel(app)}</td>
                <td><b>${CV.esc(app.nick)}</b><div class="small muted">${CV.esc(app.discord)}</div></td>
                <td class="muted" style="max-width:240px">${CV.esc(app.subject || `${CV.PLATFORMS[app.platform] || 'Medya'} · ${CV.num(app.followers)} takipçi`)}</td>
                <td>${app.priority ? CV.priorityBadge(app.priority) : '<span class="muted">—</span>'}</td>
                <td>${CV.statusBadge(app.status)}</td>
                <td class="small muted">${CV.date(app.createdAt).slice(0, 11)}</td>
                <td style="text-align:right"><button class="btn btn-soft btn-sm" data-review="${CV.esc(app.id)}">İncele</button></td>
              </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state"><div class="big">🗂️</div>Filtreye uygun başvuru yok.</div></td></tr>'}
            </tbody>
          </table>
        </div>`;
      $$('[data-review]', wrap).forEach((btn) => btn.addEventListener('click', () => {
        const app = state.apps.get(btn.dataset.review);
        if (app) openApplication(app);
      }));
    } catch (error) {
      wrap.innerHTML = `<div class="store-notice danger" style="margin:0">${CV.esc(error.message)}</div>`;
    }
  }

  function openApplication(app) {
    const isMedia = app.type === 'media';
    const detail = isMedia
      ? `<dl class="detail-grid">
          <div><dt>Platform</dt><dd>${CV.esc(CV.PLATFORMS[app.platform] || app.platform)}</dd></div>
          <div><dt>Takipçi</dt><dd>${CV.num(app.followers)}</dd></div>
          <div><dt>İçerik türü</dt><dd>${CV.esc(CV.CONTENT_TYPES[app.contentType] || app.contentType)}</dd></div>
          <div><dt>Tarih</dt><dd>${CV.date(app.createdAt)}</dd></div>
          <div class="full"><dt>Kanal</dt><dd><a href="${CV.esc(app.channel)}" target="_blank" rel="noopener" style="color:var(--purple-600)">${CV.esc(app.channel)}</a></dd></div>
        </dl>
        <div class="detail-grid">
          <div><dt>Minecraft</dt><dd>${CV.esc(app.nick)}</dd></div>
          <div><dt>Discord</dt><dd>${CV.esc(app.discord)}</dd></div>
        </div>
        <div class="detail-message">${CV.esc(app.about)}</div>`
      : `<dl class="detail-grid">
          <div><dt>Kategori</dt><dd>${CV.esc(CV.SUPPORT_CATEGORIES[app.category] || app.category)}</dd></div>
          <div><dt>Öncelik</dt><dd>${CV.priorityBadge(app.priority)}</dd></div>
          <div><dt>Minecraft</dt><dd>${CV.esc(app.nick)}</dd></div>
          <div><dt>Discord</dt><dd>${CV.esc(app.discord)}</dd></div>
          <div class="full"><dt>Konu</dt><dd>${CV.esc(app.subject)}</dd></div>
        </dl>
        <div class="detail-message">${CV.esc(app.message)}</div>`;

    const statusLine = app.reply
      ? `<div class="detail-message mt-16" style="background:var(--green-soft);border-color:#c9f0d7"><b>Verilen yanıt:</b><br>${CV.esc(app.reply)}</div>`
      : '';

    const modal = CV.modal({
      title: `${typeLabel(app)} başvurusu · ${app.code}`,
      subtitle: `${app.nick} · ${CV.date(app.createdAt)} · ${CV.statusLabel(app.status)}`,
      wide: true,
      body: `
        <div class="flex gap-8" style="margin-bottom:14px;flex-wrap:wrap">
          ${CV.statusBadge(app.status)}
          ${app.priority ? CV.priorityBadge(app.priority) : ''}
        </div>
        ${detail}
        ${statusLine}
        <div class="review-box">
          <label for="reviewReply">Yanıt / not</label>
          <textarea id="reviewReply" maxlength="1200" placeholder="Onay veya ret gerekçesi…">${CV.esc(app.reply || '')}</textarea>
        </div>
        <div id="reviewErr" class="store-notice danger" style="display:none;margin:12px 0 0"></div>`,
      actions: [
        { label: 'Kapat', className: 'btn-ghost' },
        { label: 'Reddet', className: 'btn-danger', keepOpen: true, onClick: () => review(app, 'rejected', modal) },
        { label: 'Onayla', className: 'btn-success', keepOpen: true, onClick: () => review(app, 'approved', modal) }
      ]
    });
    return modal;
  }

  async function review(app, action, modal) {
    const reply = $('#reviewReply', modal.root)?.value.trim() || '';
    const err = $('#reviewErr', modal.root);
    if (action === 'rejected' && reply.length < 3) {
      if (err) { err.textContent = 'Reddetmek için kısa bir gerekçe yaz.'; err.style.display = 'flex'; }
      return false;
    }
    const btn = [...modal.root.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent === (action === 'approved' ? 'Onayla' : 'Reddet'));
    if (btn) { btn.disabled = true; btn.textContent = 'İşleniyor…'; }
    try {
      await API.adminPost(`/admin/applications/${app.id}/review`, { action, reply });
      CV.toast(action === 'approved' ? 'Başvuru onaylandı.' : 'Başvuru reddedildi.', 'success');
      modal.close();
      await refreshCounts();
      if (state.tab === 'dashboard' || state.tab === 'applications') render();
    } catch (error) {
      if (err) { err.textContent = error.message; err.style.display = 'flex'; }
      else CV.toast(error.message, 'error');
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = action === 'approved' ? 'Onayla' : 'Reddet'; }
    }
    return true;
  }

  /* ---------------- panel: siparişler ---------------- */

  async function renderOrders(host) {
    host.innerHTML = `<div class="admin-panel">
      <div class="admin-panel-head"><div><h2>Sipariş listesi</h2><p>Durumu değiştirdiğinde kayıt anında güncellenir.</p></div></div>
      <div class="admin-toolbar">
        <select class="input input-sm" id="orderStatus" style="width:auto">
          ${['all', 'pending', 'paid', 'delivered', 'cancelled'].map((s) => `<option value="${s}" ${state.orderFilter.status === s ? 'selected' : ''}>${s === 'all' ? 'Tüm durumlar' : CV.statusLabel(s)}</option>`).join('')}
        </select>
        <input class="input input-sm grow" id="orderSearch" placeholder="Kod, nick veya Discord ara…" value="${CV.esc(state.orderFilter.q)}">
      </div>
      <div id="orderTableWrap"><div class="empty-state">Yükleniyor…</div></div>
    </div>`;

    $('#orderStatus', host).addEventListener('change', (event) => {
      state.orderFilter.status = event.target.value;
      loadOrdersTable();
    });
    let timer;
    $('#orderSearch', host).addEventListener('input', (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.orderFilter.q = event.target.value.trim();
        loadOrdersTable();
      }, 250);
    });
    await loadOrdersTable();
  }

  async function loadOrdersTable() {
    const wrap = $('#orderTableWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
    try {
      const params = new URLSearchParams(state.orderFilter);
      const data = await API.adminGet(`/admin/orders?${params}`);
      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="mini-table">
            <thead><tr><th>Kod</th><th>Oyuncu</th><th>Ürünler</th><th class="num">Tutar</th><th>Ödeme</th><th>Durum</th><th>Tarih</th></tr></thead>
            <tbody>
              ${data.orders.map((order) => `<tr>
                <td class="mono">${CV.esc(order.code)}</td>
                <td><b>${CV.esc(order.nick)}</b><div class="small muted">${CV.esc(order.discord || '—')}</div></td>
                <td class="muted" style="max-width:240px">${CV.esc(order.items.map((i) => `${i.name} ×${i.qty}`).join(', '))}</td>
                <td class="num">${CV.money(order.total)}</td>
                <td class="small">${CV.esc(METHOD_LABELS[order.method] || order.method)}</td>
                <td>
                  <select class="input input-sm" style="width:auto" data-order="${CV.esc(order.id)}">
                    ${['pending', 'paid', 'delivered', 'cancelled'].map((s) => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${CV.statusLabel(s)}</option>`).join('')}
                  </select>
                </td>
                <td class="small muted">${CV.date(order.createdAt).slice(0, 11)}</td>
              </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">Sipariş bulunamadı.</div></td></tr>'}
            </tbody>
          </table>
        </div>`;

      $$('[data-order]', wrap).forEach((select) => {
        select.addEventListener('change', async () => {
          const original = select.dataset.previous || '';
          select.disabled = true;
          try {
            await API.adminPost(`/admin/orders/${select.dataset.order}/status`, { status: select.value });
            CV.toast('Sipariş durumu güncellendi.', 'success');
            refreshCounts();
          } catch (error) {
            CV.toast(error.message, 'error');
            if (original) select.value = original;
          } finally {
            select.disabled = false;
            select.dataset.previous = select.value;
          }
        });
      });
    } catch (error) {
      wrap.innerHTML = `<div class="store-notice danger" style="margin:0">${CV.esc(error.message)}</div>`;
    }
  }

  /* ---------------- panel: oyuncular ---------------- */

  async function renderPlayers(host) {
    host.innerHTML = `<div class="admin-panel">
      <div class="admin-panel-head"><div><h2>Oyuncu verileri</h2><p>Bakiye değişiklikleri Baltop'a, ELO değişiklikleri sıralamaya yansır.</p></div>
        <button class="btn btn-primary btn-sm" id="addPlayerBtn">+ Oyuncu Ekle</button></div>
      <div class="admin-toolbar">
        <input class="input input-sm grow" id="playerSearch" placeholder="Nick ara…" value="${CV.esc(state.playerQuery)}">
      </div>
      <div id="playerTableWrap"><div class="empty-state">Yükleniyor…</div></div>
    </div>`;

    $('#addPlayerBtn', host).addEventListener('click', () => openPlayerModal(null));
    let timer;
    $('#playerSearch', host).addEventListener('input', (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.playerQuery = event.target.value.trim();
        loadPlayersTable();
      }, 220);
    });
    await loadPlayersTable();
  }

  async function loadPlayersTable() {
    const wrap = $('#playerTableWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
    try {
      const data = await API.adminGet(`/admin/players?q=${encodeURIComponent(state.playerQuery)}`);
      state.users = new Map(data.players.map((p) => [p.id, p]));
      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="mini-table">
            <thead><tr><th>Sıra</th><th>Oyuncu</th><th>VIP</th><th class="num">Bakiye</th><th class="num">ELO</th><th class="num">Süre</th><th></th></tr></thead>
            <tbody>
              ${data.players.map((p) => `<tr>
                <td class="mono">#${p.rank}</td>
                <td><div class="player-cell"><span class="avatar">${CV.initials(p.nick)}</span><span class="who"><strong>${CV.esc(p.nick)}</strong><small>${CV.esc(p.vip)}</small></span></div></td>
                <td>${p.vip === 'Yok' ? '<span class="muted">—</span>' : `<span class="tier tier-elmas">${CV.esc(p.vip)}</span>`}</td>
                <td class="num">${CV.num(p.balance)} CP</td>
                <td class="num">${CV.num(p.elo)}</td>
                <td class="num">${CV.num(p.playtime)} sa</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-soft btn-sm" data-edit-player="${CV.esc(p.id)}">Düzenle</button>
                  <button class="btn btn-danger btn-sm" data-del-player="${CV.esc(p.id)}">Sil</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">Oyuncu bulunamadı.</div></td></tr>'}
            </tbody>
          </table>
        </div>`;

      $$('[data-edit-player]', wrap).forEach((btn) => btn.addEventListener('click', () => {
        const player = state.users.get(btn.dataset.editPlayer);
        if (player) openPlayerModal(player);
      }));
      $$('[data-del-player]', wrap).forEach((btn) => btn.addEventListener('click', async () => {
        const player = state.users.get(btn.dataset.delPlayer);
        if (!player) return;
        const ok = await CV.confirm({
          title: 'Oyuncuyu sil',
          message: `<b>${CV.esc(player.nick)}</b> kalıcı olarak silinecek. Emin misin?`,
          confirmText: 'Sil',
          danger: true
        });
        if (!ok) return;
        try {
          await API.adminDel(`/admin/players/${player.id}`);
          CV.toast('Oyuncu silindi.', 'success');
          loadPlayersTable();
        } catch (error) {
          CV.toast(error.message, 'error');
        }
      }));
    } catch (error) {
      wrap.innerHTML = `<div class="store-notice danger" style="margin:0">${CV.esc(error.message)}</div>`;
    }
  }

  function openPlayerModal(player) {
    const editing = !!player;
    const modal = CV.modal({
      title: editing ? `${player.nick} düzenle` : 'Yeni oyuncu ekle',
      subtitle: editing ? 'Bakiye ve ELO değerlerini güncelle.' : 'Baltop ve ELO listesine yeni bir oyuncu ekle.',
      body: `
        <div class="form-grid">
          <div class="field"><label>Nick</label><input id="pNick" maxlength="16" value="${editing ? CV.esc(player.nick) : ''}" ${editing ? 'disabled' : ''}></div>
          <div class="field"><label>VIP</label>
            <select id="pVip">
              ${['Yok', 'VIP Bronz', 'VIP Gümüş', 'VIP Altın', 'VIP Elmas'].map((v) => `<option ${editing && player.vip === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Bakiye (CP)</label><input id="pBalance" type="number" min="0" step="1" value="${editing ? player.balance : 0}"></div>
          <div class="field"><label>ELO</label><input id="pElo" type="number" min="0" max="4000" step="1" value="${editing ? player.elo : 1000}"></div>
          <div class="field full"><label>Oynama süresi (saat)</label><input id="pPlaytime" type="number" min="0" step="1" value="${editing ? player.playtime : 0}"></div>
        </div>
        <div id="playerErr" class="store-notice danger" style="display:none;margin:12px 0 0"></div>`,
      actions: [
        { label: 'Vazgeç', className: 'btn-ghost' },
        {
          label: editing ? 'Kaydet' : 'Ekle',
          className: 'btn-primary',
          keepOpen: true,
          onClick: async () => {
            const err = $('#playerErr', modal.root);
            const payload = {
              nick: $('#pNick', modal.root).value.trim(),
              vip: $('#pVip', modal.root).value,
              balance: Number($('#pBalance', modal.root).value) || 0,
              elo: Number($('#pElo', modal.root).value) || 0,
              playtime: Number($('#pPlaytime', modal.root).value) || 0
            };
            if (!/^[A-Za-z0-9_]{3,16}$/.test(payload.nick)) {
              err.textContent = 'Geçerli bir nick gir.';
              err.style.display = 'flex';
              return false;
            }
            try {
              if (editing) await API.adminPut(`/admin/players/${player.id}`, payload);
              else await API.adminPost('/admin/players', payload);
              modal.close();
              CV.toast(editing ? 'Oyuncu güncellendi.' : 'Oyuncu eklendi.', 'success');
              loadPlayersTable();
              return true;
            } catch (error) {
              err.textContent = error.message;
              err.style.display = 'flex';
              return false;
            }
          }
        }
      ]
    });
    return modal;
  }

  /* ---------------- panel: ürünler ---------------- */

  async function renderProducts(host) {
    host.innerHTML = `<div class="admin-panel">
      <div class="admin-panel-head"><div><h2>Mağaza ürünleri</h2><p>Fiyat, içerik ve görünürlüğü buradan yönet.</p></div>
        <button class="btn btn-primary btn-sm" id="addProductBtn">+ Ürün Ekle</button></div>
      <div id="productTableWrap"><div class="empty-state">Yükleniyor…</div></div>
    </div>`;

    $('#addProductBtn', host).addEventListener('click', () => openProductModal(null));
    await loadProductsTable();
  }

  async function loadProductsTable() {
    const wrap = $('#productTableWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
    try {
      const data = await API.adminGet('/admin/products');
      state.products = data.products;
      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="mini-table">
            <thead><tr><th>Ürün</th><th>Kategori</th><th class="num">Fiyat</th><th class="num">Eski</th><th>Durum</th><th>Öne çıkan</th><th></th></tr></thead>
            <tbody>
              ${data.products.map((p) => `<tr>
                <td><b>${CV.esc(p.name)}</b><div class="small muted">${CV.esc((p.perks || []).slice(0, 3).join(' · '))}</div></td>
                <td><span class="tag">${CV.esc(p.category)}</span></td>
                <td class="num">${CV.money(p.price)}</td>
                <td class="num muted">${p.oldPrice ? CV.money(p.oldPrice) : '—'}</td>
                <td>${p.active === false ? '<span class="badge-status st-rejected">Pasif</span>' : '<span class="badge-status st-approved">Aktif</span>'}</td>
                <td>${p.featured ? '<span class="badge-status st-paid">Evet</span>' : '<span class="muted">—</span>'}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-soft btn-sm" data-edit-product="${CV.esc(p.id)}">Düzenle</button>
                  <button class="btn btn-danger btn-sm" data-del-product="${CV.esc(p.id)}">Sil</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state">Ürün yok.</div></td></tr>'}
            </tbody>
          </table>
        </div>`;

      $$('[data-edit-product]', wrap).forEach((btn) => btn.addEventListener('click', () => {
        const product = state.products.find((p) => p.id === btn.dataset.editProduct);
        if (product) openProductModal(product);
      }));
      $$('[data-del-product]', wrap).forEach((btn) => btn.addEventListener('click', async () => {
        const product = state.products.find((p) => p.id === btn.dataset.delProduct);
        if (!product) return;
        const ok = await CV.confirm({
          title: 'Ürünü sil',
          message: `<b>${CV.esc(product.name)}</b> mağazadan kaldırılacak. Emin misin?`,
          confirmText: 'Sil',
          danger: true
        });
        if (!ok) return;
        try {
          await API.adminDel(`/admin/products/${product.id}`);
          CV.toast('Ürün silindi.', 'success');
          loadProductsTable();
        } catch (error) {
          CV.toast(error.message, 'error');
        }
      }));
    } catch (error) {
      wrap.innerHTML = `<div class="store-notice danger" style="margin:0">${CV.esc(error.message)}</div>`;
    }
  }

  function openProductModal(product) {
    const editing = !!product;
    const modal = CV.modal({
      title: editing ? 'Ürünü düzenle' : 'Yeni ürün',
      subtitle: 'Mağazada görünecek bilgileri gir.',
      wide: true,
      body: `
        <div class="form-grid">
          <div class="field"><label>Ürün adı</label><input id="prName" maxlength="60" value="${editing ? CV.esc(product.name) : ''}"></div>
          <div class="field"><label>Kategori</label>
            <select id="prCategory">
              ${['VIP', 'Kasa', 'Kredi', 'Unvan'].map((c) => `<option ${editing && product.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Fiyat (₺)</label><input id="prPrice" type="number" min="0.01" step="0.01" value="${editing ? product.price : 49.9}"></div>
          <div class="field"><label>Eski fiyat (₺, opsiyonel)</label><input id="prOld" type="number" min="0" step="0.01" value="${editing && product.oldPrice ? product.oldPrice : ''}"></div>
          <div class="field full"><label>Kısa açıklama</label><input id="prDesc" maxlength="400" value="${editing ? CV.esc(product.desc || '') : ''}"></div>
          <div class="field full"><label>Avantajlar (her satır bir madde)</label><textarea id="prPerks" style="min-height:100px">${editing ? CV.esc((product.perks || []).join('\n')) : ''}</textarea></div>
          <div class="field"><label>Etiket (badge)</label><input id="prBadge" maxlength="30" value="${editing ? CV.esc(product.badge || '') : ''}" placeholder="Popüler"></div>
          <div class="field"><label>Sıra</label><input id="prSort" type="number" step="1" value="${editing ? product.sort : (state.products.length + 1) * 10}"></div>
          <div class="field"><label class="checkline"><input type="checkbox" id="prFeatured" ${editing && product.featured ? 'checked' : ''}> Anasayfada öne çıkar</label></div>
          <div class="field"><label class="checkline"><input type="checkbox" id="prActive" ${!editing || product.active !== false ? 'checked' : ''}> Mağazada aktif</label></div>
        </div>
        <div id="productErr" class="store-notice danger" style="display:none;margin:12px 0 0"></div>`,
      actions: [
        { label: 'Vazgeç', className: 'btn-ghost' },
        {
          label: editing ? 'Kaydet' : 'Ekle',
          className: 'btn-primary',
          keepOpen: true,
          onClick: async () => {
            const err = $('#productErr', modal.root);
            const payload = {
              name: $('#prName', modal.root).value.trim(),
              category: $('#prCategory', modal.root).value,
              price: Number($('#prPrice', modal.root).value) || 0,
              oldPrice: Number($('#prOld', modal.root).value) || null,
              desc: $('#prDesc', modal.root).value.trim(),
              perks: $('#prPerks', modal.root).value.split('\n').map((p) => p.trim()).filter(Boolean),
              badge: $('#prBadge', modal.root).value.trim(),
              sort: Number($('#prSort', modal.root).value) || 0,
              featured: $('#prFeatured', modal.root).checked,
              active: $('#prActive', modal.root).checked
            };
            if (!payload.name) { err.textContent = 'Ürün adı gerekli.'; err.style.display = 'flex'; return false; }
            if (!(payload.price > 0)) { err.textContent = 'Geçerli bir fiyat gir.'; err.style.display = 'flex'; return false; }
            try {
              if (editing) await API.adminPut(`/admin/products/${product.id}`, payload);
              else await API.adminPost('/admin/products', payload);
              modal.close();
              CV.toast(editing ? 'Ürün güncellendi.' : 'Ürün eklendi.', 'success');
              loadProductsTable();
              return true;
            } catch (error) {
              err.textContent = error.message;
              err.style.display = 'flex';
              return false;
            }
          }
        }
      ]
    });
    return modal;
  }

  /* ---------------- panel: ayarlar ---------------- */

  async function renderSettings(host) {
    const data = await API.adminGet('/admin/settings');
    state.settings = data.settings;
    const s = data.settings;
    host.innerHTML = `
      <div class="admin-panel">
        <div class="admin-panel-head"><div><h2>Sunucu &amp; site</h2><p>Bu bilgiler sitenin her yerinde görünür.</p></div></div>
        <div class="settings-grid">
          <div class="field"><label>Site adı</label><input id="sSiteName" value="${CV.esc(s.siteName)}"></div>
          <div class="field"><label>Sunucu IP</label><input id="sIp" value="${CV.esc(s.ip)}"></div>
          <div class="field"><label>Port</label><input id="sPort" type="number" min="1" max="65535" value="${s.port}"></div>
          <div class="field"><label>Minecraft sürümü</label><input id="sVersion" value="${CV.esc(s.version)}"></div>
          <div class="field"><label>Çevrimiçi oyuncu</label><input id="sOnline" type="number" min="0" value="${s.online}"></div>
          <div class="field"><label>Maksimum oyuncu</label><input id="sMaxOnline" type="number" min="1" value="${s.maxOnline}"></div>
          <div class="field"><label>Kayıtlı oyuncu</label><input id="sRegistered" type="number" min="0" value="${s.registered}"></div>
          <div class="field"><label>Sezon adı</label><input id="sSeason" value="${CV.esc(s.season)}"></div>
          <div class="field"><label>Sezon bitiş tarihi</label><input id="sSeasonEnds" type="date" value="${CV.esc(s.seasonEnds || '')}"></div>
          <div class="field"><label>Discord davet linki</label><input id="sDiscord" value="${CV.esc(s.discord)}"></div>
          <div class="field"><label>Yönetici kullanıcı adı</label><input value="${CV.esc(s.adminUser)}" disabled></div>
        </div>
        <div class="settings-grid mt-16">
          <div class="toggle-row">
            <div><b>Mağaza açık</b><small>Kapatırsan sipariş alınamaz.</small></div>
            <label class="switch"><input type="checkbox" id="sStoreOpen" ${s.storeOpen ? 'checked' : ''}><span></span></label>
          </div>
          <div class="toggle-row">
            <div><b>Bakım modu</b><small>Mağazayı ve siparişleri kapatır.</small></div>
            <label class="switch"><input type="checkbox" id="sMaintenance" ${s.maintenance ? 'checked' : ''}><span></span></label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="saveSettingsBtn">Ayarları Kaydet</button>
          <span class="small muted">Kaydettiğinde site anında güncellenir.</span>
        </div>
        <div id="settingsMsg" class="store-notice" style="display:none;margin-top:14px"></div>
      </div>

      <div class="admin-panel">
        <div class="admin-panel-head"><div><h2>Şifre değiştir</h2><p>Güvenli bir şifre kullan, en az 8 karakter.</p></div></div>
        <div class="settings-grid">
          <div class="field"><label>Mevcut şifre</label><input id="pwCurrent" type="password" autocomplete="current-password"></div>
          <div class="field"><label>Yeni şifre</label><input id="pwNext" type="password" autocomplete="new-password"></div>
        </div>
        <div class="form-actions"><button class="btn btn-ghost" id="savePasswordBtn">Şifreyi Güncelle</button></div>
        <div id="pwMsg" class="store-notice" style="display:none;margin-top:14px"></div>
      </div>

      <div class="admin-panel">
        <div class="admin-panel-head"><div><h2>Yedekleme</h2><p>Tüm verileri JSON olarak indir veya geri yükle.</p></div></div>
        <div class="flex gap-8" style="flex-wrap:wrap">
          <button class="btn btn-ghost" id="exportBtn">⬇ Yedeği indir</button>
          <label class="btn btn-ghost" style="cursor:pointer">⬆ Yedek yükle<input id="importInput" type="file" accept="application/json" hidden></label>
        </div>
        <p class="small muted mt-8">Yedek geri yüklendiğinde oturumun kapanır ve tekrar giriş yapman gerekir.</p>
      </div>

      <div class="admin-panel danger-zone">
        <div class="admin-panel-head"><div><h2>Demo verilerini sıfırla</h2><p>Başvurular, siparişler ve oyuncular örnek verilere döner. Admin bilgileri korunur.</p></div></div>
        <button class="btn btn-danger" id="resetBtn">Sıfırla</button>
      </div>`;

    $('#saveSettingsBtn', host).addEventListener('click', async () => {
      const msg = $('#settingsMsg', host);
      const btn = $('#saveSettingsBtn', host);
      btn.disabled = true;
      try {
        const body = {
          siteName: $('#sSiteName', host).value.trim(),
          ip: $('#sIp', host).value.trim(),
          port: Number($('#sPort', host).value),
          version: $('#sVersion', host).value.trim(),
          online: Number($('#sOnline', host).value),
          maxOnline: Number($('#sMaxOnline', host).value),
          registered: Number($('#sRegistered', host).value),
          season: $('#sSeason', host).value.trim(),
          seasonEnds: $('#sSeasonEnds', host).value,
          discord: $('#sDiscord', host).value.trim(),
          storeOpen: $('#sStoreOpen', host).checked,
          maintenance: $('#sMaintenance', host).checked
        };
        await API.adminPut('/admin/settings', body);
        CV.toast('Ayarlar kaydedildi.', 'success');
        msg.className = 'store-notice';
        msg.textContent = 'Ayarlar kaydedildi. Değişiklikler siteye yansıdı.';
        msg.style.display = 'flex';
        msg.style.background = 'var(--green-soft)';
        msg.style.borderColor = '#c9f0d7';
        msg.style.color = 'var(--green)';
        site = await API.get('/site');
        CV.applySite(site);
      } catch (error) {
        CV.toast(error.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('#savePasswordBtn', host).addEventListener('click', async () => {
      const msg = $('#pwMsg', host);
      const current = $('#pwCurrent', host).value;
      const next = $('#pwNext', host).value;
      if (next.length < 8) {
        msg.textContent = 'Yeni şifre en az 8 karakter olmalı.';
        msg.style.display = 'flex';
        msg.className = 'store-notice danger';
        return;
      }
      try {
        await API.post('/auth/password', { current, next });
        CV.toast('Şifre güncellendi, tekrar giriş yap.', 'success');
        API.clearToken();
        showLogin('Şifre güncellendi. Yeni şifrenle giriş yap.');
      } catch (error) {
        msg.textContent = error.message;
        msg.className = 'store-notice danger';
        msg.style.display = 'flex';
      }
    });

    $('#exportBtn', host).addEventListener('click', async () => {
      try {
        const res = await fetch('/api/admin/export', { headers: { Authorization: `Bearer ${API.token}` } });
        if (!res.ok) throw new Error('Yedek indirilemedi.');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `corenya-yedek-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        CV.toast('Yedek indirildi.', 'success');
      } catch (error) {
        CV.toast(error.message, 'error');
      }
    });

    $('#importInput', host).addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const ok = await CV.confirm({
          title: 'Yedeği geri yükle',
          message: 'Mevcut tüm veriler yedekteki verilerle değiştirilecek. Devam edilsin mi?',
          confirmText: 'Geri yükle',
          danger: true
        });
        if (!ok) return;
        await API.adminPost('/admin/import', { data });
        CV.toast('Yedek yüklendi. Tekrar giriş yap.', 'success');
        API.clearToken();
        showLogin('Yedek yüklendi, tekrar giriş yap.');
      } catch (error) {
        CV.toast(error.message || 'Yedek dosyası okunamadı.', 'error');
      }
    });

    $('#resetBtn', host).addEventListener('click', async () => {
      const ok = await CV.confirm({
        title: 'Demo verilerini sıfırla',
        message: 'Tüm başvurular, siparişler ve oyuncular örnek verilere dönecek. Bu işlem geri alınamaz.',
        confirmText: 'Sıfırla',
        danger: true
      });
      if (!ok) return;
      try {
        await API.adminPost('/admin/reset');
        CV.toast('Veriler sıfırlandı.', 'success');
        API.clearToken();
        showLogin('Veriler sıfırlandı, tekrar giriş yap.');
      } catch (error) {
        CV.toast(error.message, 'error');
      }
    });
  }

  /* ---------------- başlat ---------------- */

  await checkSession();
})();
