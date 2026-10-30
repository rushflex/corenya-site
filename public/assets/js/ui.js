const CV = (() => {
  const FALLBACK_SITE = {
    settings: {
      siteName: 'Corenya Vanilla', ip: 'corenyavanilla.com', port: 25565, version: '1.21.4',
      online: 148, maxOnline: 500, registered: 1284, discord: 'https://discord.gg/corenya',
      storeOpen: true, maintenance: false, season: 'Sezon 4', seasonEnds: '2026-12-20'
    },
    stats: { registered: 1284, pending: 0, approved: 0, orders: 0 },
    topBalance: [], topElo: [], featured: [], categories: ['VIP', 'Kasa', 'Kredi', 'Unvan']
  };

  const state = { site: null, booted: false, toastRoot: null };

  /* ---------------- yardımcılar ---------------- */

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const num = (value) => new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
  const money = (value) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} ₺`;
  const coins = (value) => `${num(value)} CP`;

  const date = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const timeAgo = (iso) => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'az önce';
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} saat önce`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} gün önce`;
    return date(iso).slice(0, 11);
  };

  const initials = (nick) => String(nick || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

  const STATUS = {
    pending: { label: 'Beklemede', cls: 'st-pending' },
    approved: { label: 'Onaylandı', cls: 'st-approved' },
    rejected: { label: 'Reddedildi', cls: 'st-rejected' },
    paid: { label: 'Ödendi', cls: 'st-paid' },
    delivered: { label: 'Teslim edildi', cls: 'st-delivered' },
    cancelled: { label: 'İptal', cls: 'st-cancelled' }
  };

  const statusBadge = (status) => {
    const info = STATUS[status] || { label: status || '—', cls: 'st-pending' };
    return `<span class="badge-status ${info.cls}">${esc(info.label)}</span>`;
  };
  const statusLabel = (status) => (STATUS[status]?.label || status || '—');

  const PRIORITY = {
    normal: { label: 'Normal', cls: 'st-normal' },
    high: { label: 'Yüksek', cls: 'st-high' },
    urgent: { label: 'Acil', cls: 'st-urgent' }
  };
  const priorityBadge = (p) => {
    const info = PRIORITY[p] || { label: 'Normal', cls: 'st-normal' };
    return `<span class="badge-status ${info.cls}">${esc(info.label)}</span>`;
  };

  const SUPPORT_CATEGORIES = {
    hata: 'Hata / Bug',
    item: 'Eşya / Envanter',
    sikayet: 'Oyuncu Şikayeti',
    ceza: 'Ceza İtirazı',
    odeme: 'Mağaza / Ödeme',
    oneri: 'Öneri / İstek',
    diger: 'Diğer'
  };

  const PLATFORMS = {
    youtube: 'YouTube', twitch: 'Twitch', tiktok: 'TikTok',
    instagram: 'Instagram', kick: 'Kick', diger: 'Diğer'
  };

  const CONTENT_TYPES = {
    video: 'Uzun Video', shorts: 'Shorts / Reels', yayin: 'Canlı Yayın', blog: 'Blog / Yazı'
  };

  const TIERS = [
    { key: 'bronz', name: 'Bronz', min: 0, max: 1200 },
    { key: 'gumus', name: 'Gümüş', min: 1200, max: 1500 },
    { key: 'altin', name: 'Altın', min: 1500, max: 1800 },
    { key: 'platin', name: 'Platin', min: 1800, max: 2100 },
    { key: 'elmas', name: 'Elmas', min: 2100, max: 2400 },
    { key: 'efsane', name: 'Efsane', min: 2400, max: 4000 }
  ];

  function tierOf(elo) {
    const value = Number(elo) || 0;
    const tier = TIERS.find((t) => value >= t.min && value < t.max) || TIERS[TIERS.length - 1];
    const span = tier.max - tier.min;
    const progress = tier.key === 'efsane' ? 100 : Math.max(0, Math.min(100, ((value - tier.min) / span) * 100));
    return { ...tier, progress, next: tier.key === 'efsane' ? null : tier.max };
  }

  const tierBadge = (elo) => {
    const tier = tierOf(elo);
    return `<span class="tier tier-${tier.key}">${tier.name}</span>`;
  };

  /* ---------------- toast / modal ---------------- */

  function toastRoot() {
    if (!state.toastRoot) {
      state.toastRoot = document.createElement('div');
      state.toastRoot.className = 'toast-stack';
      document.body.appendChild(state.toastRoot);
    }
    return state.toastRoot;
  }

  function toast(message, type = 'info', timeout = 4200) {
    const icons = { success: '✓', error: '✕', warn: '!', info: 'i' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="t-ico">${icons[type] || 'i'}</span><span>${esc(message)}</span>`;
    toastRoot().appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      setTimeout(() => el.remove(), 260);
    }, timeout);
  }

  function modal({ title, subtitle = '', body = '', actions = [], wide = false, onClose = null }) {
    const root = document.createElement('div');
    root.className = 'modal-backdrop';
    root.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button class="icon-btn" data-close aria-label="Kapat">✕</button>
        </div>
        <div class="modal-body"></div>
        ${actions.length ? '<div class="modal-foot"></div>' : ''}
      </div>`;

    const bodyEl = root.querySelector('.modal-body');
    if (body instanceof Node) bodyEl.appendChild(body);
    else bodyEl.innerHTML = body;

    const foot = root.querySelector('.modal-foot');
    const ctx = { root, body: bodyEl, close: () => close() };

    const close = () => {
      root.remove();
      document.removeEventListener('keydown', onKey);
      if (typeof onClose === 'function') onClose();
    };

    actions.forEach((action) => {
      const btn = document.createElement('button');
      btn.className = `btn ${action.className || 'btn-ghost'} ${action.alignLeft ? 'spacer' : ''}`;
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', async () => {
        if (!action.onClick) return close();
        btn.disabled = true;
        try {
          const keep = await action.onClick(ctx);
          if (!action.keepOpen && keep !== false) close();
        } finally {
          btn.disabled = false;
        }
      });
      if (foot) foot.appendChild(btn);
    });

    root.addEventListener('click', (event) => {
      if (event.target === root) close();
      if (event.target.closest('[data-close]')) close();
    });

    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(root);
    setTimeout(() => root.querySelector('input, select, textarea, button')?.focus(), 60);
    return ctx;
  }

  function confirm({ title = 'Emin misin?', message = '', confirmText = 'Evet', cancelText = 'Vazgeç', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      modal({
        title,
        body: `<p class="muted" style="font-size:.9rem">${message}</p>`,
        actions: [
          { label: cancelText, className: 'btn-ghost', onClick: () => { answered = true; resolve(false); } },
          { label: confirmText, className: danger ? 'btn-danger' : 'btn-primary', onClick: () => { answered = true; resolve(true); } }
        ],
        onClose: () => { if (!answered) resolve(false); }
      });
    });
  }

  /* ---------------- pano / kopyalama ---------------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  async function copy(value, label = 'Panoya kopyalandı') {
    const ok = await copyText(value);
    toast(ok ? label : 'Kopyalanamadı, elle seçebilirsin.', ok ? 'success' : 'warn');
    return ok;
  }

  /* ---------------- kabuk ---------------- */

  const logoSVG = (size = 42) => `
    <svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cvlogo" x1="8" y1="4" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ff5aa8"/><stop offset="0.55" stop-color="#b06bff"/><stop offset="1" stop-color="#7c3aed"/>
        </linearGradient>
      </defs>
      <path d="M24 3.4 42.4 13.7v20.6L24 44.6 5.6 34.3V13.7L24 3.4Z" fill="url(#cvlogo)"/>
      <path d="M24 13.6 34 18.9v10.2L24 34.4l-10-5.3V18.9l10-5.3Z" fill="#fff" fill-opacity="0.92"/>
      <path d="M24 13.6v20.8M14 18.9l10 5.3 10-5.3" stroke="#a855f7" stroke-opacity="0.3" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`;

  const NAV = [
    ['home', 'index.html', 'Anasayfa'],
    ['store', 'magaza.html', 'Mağaza'],
    ['baltop', 'baltop.html', 'Baltop'],
    ['elo', 'elo.html', 'ELO'],
    ['support', 'destek.html', 'Destek'],
    ['media', 'medya.html', 'Medya']
  ];

  function headerHTML(settings) {
    const page = document.body.dataset.page || 'home';
    return `
      <header class="site-header" id="siteHeader">
        <div class="container header-inner">
          <a class="brand" href="index.html" aria-label="Corenya Vanilla anasayfa">
            <span class="brand-mark">${logoSVG(42)}</span>
            <span class="brand-text">
              <strong>Corenya<span>Vanilla</span></strong>
              <small>${esc(settings.season || 'Sezon 4')} · VANILLA SMP</small>
            </span>
          </a>
          <nav class="main-nav" id="mainNav" aria-label="Ana menü">
            ${NAV.map(([key, href, label]) => `<a href="${href}" class="${page === key ? 'active' : ''}">${label}</a>`).join('')}
          </nav>
          <div class="header-actions">
            <button class="ip-chip" type="button" data-copy="ip" title="Sunucu IP'sini kopyala">
              <span class="ip-dot"></span>
              <span data-ip>${esc(settings.ip)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <a class="btn btn-primary btn-sm" href="magaza.html">VIP Al</a>
            <button class="nav-toggle" id="navToggle" type="button" aria-label="Menüyü aç" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </header>`;
  }

  function footerHTML(settings) {
    const year = new Date().getFullYear();
    return `
      <footer class="site-footer">
        <div class="container footer-grid">
          <div class="footer-brand">
            <a class="brand" href="index.html">
              <span class="brand-mark">${logoSVG(42)}</span>
              <span class="brand-text">
                <strong>Corenya<span>Vanilla</span></strong>
                <small>${esc(settings.season || 'Sezon 4')} · VANILLA SMP</small>
              </span>
            </a>
            <p>Vanilla ruhunu bozmadan, tatlı bir toplulukla oynanan Türk Minecraft sunucusu. Baltop, ELO ve etkinliklerle dolu bir dünya.</p>
            <div class="socials">
              <a href="${esc(settings.discord || '#')}" target="_blank" rel="noopener" title="Discord">💬</a>
              <a href="destek.html" title="Destek">🛟</a>
              <a href="medya.html" title="Medya">🎬</a>
              <a href="admin.html" title="Yönetim">⚙️</a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Keşfet</h4>
            <a href="index.html">Anasayfa</a>
            <a href="magaza.html">Mağaza</a>
            <a href="baltop.html">Baltop</a>
            <a href="elo.html">ELO Sıralaması</a>
          </div>
          <div class="footer-col">
            <h4>Topluluk</h4>
            <a href="destek.html">Destek Başvurusu</a>
            <a href="medya.html">Medya Başvurusu</a>
            <a href="${esc(settings.discord || '#')}" target="_blank" rel="noopener">Discord Sunucusu</a>
            <a href="admin.html">Yönetim Paneli</a>
          </div>
          <div class="footer-col">
            <h4>Sunucu</h4>
            <a href="magaza.html">VIP &amp; Kasa</a>
            <a href="destek.html">Kurallar &amp; Yardım</a>
            <button type="button" class="footer-ip" data-copy="ip">
              <span class="ip-dot"></span>
              <span data-ip>${esc(settings.ip)}</span>
              <span style="margin-left:auto">⧉</span>
            </button>
            <p class="small" style="color:#b79ad8;margin-top:8px">Sürüm ${esc(settings.version || '1.21.4')} · Java Edition</p>
          </div>
        </div>
        <div class="container footer-bottom">
          <span>© ${year} Corenya Vanilla. Tüm hakları saklıdır.</span>
          <span>Rise Project tarafından geliştirildi · <a href="admin.html">Yönetim</a></span>
        </div>
      </footer>`;
  }

  function applySite(site) {
    state.site = site;
    const s = site.settings || {};
    document.querySelectorAll('[data-ip]').forEach((el) => { el.textContent = s.ip; });
    document.querySelectorAll('[data-online]').forEach((el) => { el.textContent = s.online; });
    document.querySelectorAll('[data-max-online]').forEach((el) => { el.textContent = s.maxOnline; });
    document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = s.version; });
    document.querySelectorAll('[data-season]').forEach((el) => { el.textContent = s.season; });
    document.querySelectorAll('[data-registered]').forEach((el) => { el.textContent = num(site.stats?.registered ?? s.registered); });
    document.querySelectorAll('[data-discord]').forEach((el) => { if (s.discord) el.href = s.discord; });
    document.querySelectorAll('[data-online-bar]').forEach((el) => {
      el.style.width = `${Math.min(100, Math.round(((s.online || 0) / (s.maxOnline || 1)) * 100))}%`;
    });
  }

  function offlineBanner(error) {
    if (document.getElementById('offlineBanner')) return;
    const el = document.createElement('div');
    el.id = 'offlineBanner';
    el.className = 'container';
    el.style.paddingTop = '16px';
    el.innerHTML = `
      <div class="store-notice danger" style="margin-bottom:0">
        <span>⚠️</span>
        <span><b>API'ye bağlanılamadı.</b> Siteyi <code>node server.js</code> ile başlatıp <code>http://localhost:3000</code> adresinden açmalısın. Formlar ve mağaza şu anda çalışmaz.</span>
      </div>`;
    document.querySelector('main')?.prepend(el);
    if (error?.message) console.warn(error.message);
  }

  function bindShell() {
    const header = document.getElementById('siteHeader');
    const toggle = document.getElementById('navToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const open = header.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    document.querySelectorAll('.main-nav a').forEach((link) => {
      link.addEventListener('click', () => header?.classList.remove('open'));
    });

    document.addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('[data-copy]');
      if (copyBtn) {
        event.preventDefault();
        const value = copyBtn.dataset.copy === 'ip' ? state.site?.settings?.ip : copyBtn.dataset.copy;
        if (value) await copy(value, 'Sunucu IP\'si kopyalandı');
      }
    });
  }

  function reveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px' });
    items.forEach((el) => observer.observe(el));
  }

  function countUp(el, target, duration = 900) {
    const start = performance.now();
    const from = 0;
    const to = Number(target) || 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = num(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function boot() {
    if (state.booted) return state.site;
    state.booted = true;

    let site = FALLBACK_SITE;
    try {
      site = await API.get('/site');
    } catch (error) {
      offlineBanner(error);
    }

    const headerHost = document.getElementById('site-header');
    const footerHost = document.getElementById('site-footer');
    if (headerHost) headerHost.innerHTML = headerHTML(site.settings);
    if (footerHost) footerHost.innerHTML = footerHTML(site.settings);
    applySite(site);
    bindShell();
    reveal();
    return site;
  }

  return {
    boot,
    applySite,
    get site() { return state.site || FALLBACK_SITE; },
    esc, num, money, coins, date, timeAgo, initials,
    STATUS, statusBadge, statusLabel, priorityBadge,
    SUPPORT_CATEGORIES, PLATFORMS, CONTENT_TYPES, TIERS, tierOf, tierBadge,
    toast, modal, confirm, copy, copyText, countUp, offlineBanner,
    logoSVG
  };
})();
