(async function () {
  const page = document.body.dataset.page;
  const site = await CV.boot();
  const settings = site.settings;

  /* ================================================================ */
  /* ortak parçalar                                                    */
  /* ================================================================ */

  const CATEGORY_ICON = { VIP: '👑', Kasa: '🎁', Kredi: '🪙', Unvan: '🏷️' };
  const PAYMENT_LABELS = { papara: 'Papara', kart: 'Kredi / Banka Kartı', havale: 'Havale / EFT', discord: 'Discord üzerinden' };

  function productCard(product, { link = false } = {}) {
    const badge = product.badge ? `<span class="badge">${CV.esc(product.badge)}</span>` : '';
    const old = product.oldPrice ? `<s>${CV.money(product.oldPrice)}</s>` : '';
    const perks = (product.perks || []).slice(0, 4).map((perk) => `<li>${CV.esc(perk)}</li>`).join('');
    const price = product.price === 0 ? 'Ücretsiz' : CV.money(product.price);
    const action = link
      ? `<a class="btn btn-primary btn-block" href="magaza.html">Mağazada gör</a>`
      : `<button class="btn btn-primary btn-block" type="button" data-add="${CV.esc(product.id)}">Sepete Ekle</button>`;
    return `
      <article class="product-card ${product.popular ? 'popular' : ''}">
        <div class="product-head">
          <span class="tag ${product.category === 'VIP' ? 'vip' : ''}">${CV.esc(product.category)}</span>
          ${badge}
        </div>
        <h3>${CV.esc(product.name)}</h3>
        <p class="product-desc">${CV.esc(product.desc || '')}</p>
        <div class="product-price"><strong>${price}</strong>${old}<small>KDV dahil</small></div>
        <ul class="perks">${perks}</ul>
        ${action}
      </article>`;
  }

  function boardRow(player, metric, index) {
    const value = metric === 'elo'
      ? `${CV.num(player.elo)} <small>ELO</small>`
      : `${CV.num(player.balance)} <small>CP</small>`;
    const sub = metric === 'elo' ? CV.tierOf(player.elo).name : (player.vip !== 'Yok' ? player.vip : 'Oyuncu');
    return `
      <div class="board-row">
        <span class="rank-badge r${index + 1}">${index + 1}</span>
        <span class="avatar">${CV.initials(player.nick)}</span>
        <div class="board-name">${CV.esc(player.nick)}<span>${CV.esc(sub)}</span></div>
        <div class="board-value">${value}</div>
      </div>`;
  }

  function bindTrackForm(formId, resultId) {
    const form = document.getElementById(formId);
    const result = document.getElementById(resultId);
    if (!form || !result) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input');
      const code = input.value.trim().toUpperCase();
      if (!code) return CV.toast('Takip kodunu yaz.', 'warn');
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const data = await API.get(`/track?code=${encodeURIComponent(code)}`);
        if (data.kind === 'order') {
          const order = data.order;
          result.innerHTML = `
            <div class="card success-card" style="padding:18px;border-radius:14px">
              <div class="flex items-center gap-8" style="justify-content:space-between;flex-wrap:wrap">
                <div><span class="small muted">SİPARİŞ</span><div class="mono" style="font-weight:700">${CV.esc(order.code)}</div></div>
                ${CV.statusBadge(order.status)}
              </div>
              <div class="mt-8 small muted">${CV.esc(order.nick)} · ${CV.date(order.createdAt)}</div>
              <div class="mt-8" style="font-size:.84rem">${order.items.map((i) => `${CV.esc(i.name)} × ${i.qty}`).join('<br>')}</div>
              <div class="mt-8" style="font-weight:800">${CV.money(order.total)}</div>
            </div>`;
        } else {
          const app = data.application;
          const isOrder = false;
          result.innerHTML = `
            <div class="card success-card" style="padding:18px;border-radius:14px">
              <div class="flex items-center gap-8" style="justify-content:space-between;flex-wrap:wrap">
                <div><span class="small muted">${app.type === 'media' ? 'MEDYA BAŞVURUSU' : 'DESTEK BAŞVURUSU'}</span><div class="mono" style="font-weight:700">${CV.esc(app.code)}</div></div>
                ${CV.statusBadge(app.status)}
              </div>
              <div class="mt-8 small muted">${CV.esc(app.nick)} · ${CV.date(app.createdAt)}</div>
              ${app.subject ? `<div class="mt-8" style="font-weight:700">${CV.esc(app.subject)}</div>` : ''}
              ${app.platform ? `<div class="mt-8 small muted">${CV.esc(CV.PLATFORMS[app.platform] || app.platform)} · ${CV.esc(app.channel || '')}</div>` : ''}
              ${app.reply ? `<div class="detail-message mt-8"><b>Ekip yanıtı:</b><br>${CV.esc(app.reply)}</div>` : '<p class="small muted mt-8">Henüz bir yanıt yok. Onaylandığında burada görünecek.</p>'}
            </div>`;
          void isOrder;
        }
      } catch (error) {
        result.innerHTML = `<div class="store-notice danger" style="margin:0">${CV.esc(error.message)}</div>`;
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ================================================================ */
  /* anasayfa                                                          */
  /* ================================================================ */

  function initHome() {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const key = el.dataset.count;
      if (key === 'registered') CV.countUp(el, site.stats?.registered ?? settings.registered ?? 0);
      else if (key === 'online') CV.countUp(el, settings.online || 0);
    });

    document.querySelectorAll('[data-online-bar]').forEach((el) => {
      el.style.width = `${Math.min(100, Math.round(((settings.online || 0) / (settings.maxOnline || 1)) * 100))}%`;
    });

    const featured = document.getElementById('featuredGrid');
    if (featured) {
      const items = (site.featured && site.featured.length) ? site.featured : [];
      if (!items.length) {
        document.getElementById('featuredSection')?.remove();
      } else {
        featured.innerHTML = items.map((p) => productCard(p, { link: true })).join('');
      }
    }

    if (site.topBalance?.[0]) {
      const float = document.getElementById('floatBaltop');
      if (float) float.textContent = site.topBalance[0].nick;
    }
    if (site.topElo?.[0]) {
      const float = document.getElementById('floatElo');
      if (float) float.textContent = `${CV.num(site.topElo[0].elo)} ELO`;
    }

    const homeBalance = document.getElementById('homeBaltop');
    if (homeBalance) {
      homeBalance.innerHTML = (site.topBalance || []).map((p, i) => boardRow(p, 'balance', i)).join('') ||
        '<p class="muted small" style="padding:10px">Sıralama yükleniyor…</p>';
    }

    const homeElo = document.getElementById('homeElo');
    if (homeElo) {
      homeElo.innerHTML = (site.topElo || []).map((p, i) => boardRow(p, 'elo', i)).join('') ||
        '<p class="muted small" style="padding:10px">Sıralama yükleniyor…</p>';
    }

    document.querySelectorAll('[data-season-end]').forEach((el) => {
      el.textContent = settings.seasonEnds ? new Date(settings.seasonEnds).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
    });
  }

  /* ================================================================ */
  /* mağaza                                                            */
  /* ================================================================ */

  async function initStore() {
    const grid = document.getElementById('productGrid');
    const filters = document.getElementById('filters');
    const countEl = document.getElementById('cartCount');
    const notice = document.getElementById('storeNotice');

    let products = [];
    let filter = 'Tümü';
    let cart = [];
    const CART_KEY = 'cv_cart_v1';

    try {
      const data = await API.get('/products');
      products = data.products;
    } catch (error) {
      CV.toast(error.message, 'error');
    }

    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      cart = Array.isArray(raw) ? raw.filter((item) => products.some((p) => p.id === item.id)) : [];
    } catch { cart = []; }

    if (settings.maintenance) {
      notice.innerHTML = `<div class="store-notice danger">🛠️ Sunucu bakımda. Mağaza geçici olarak kapalı, sipariş oluşturulamaz.</div>`;
    } else if (!settings.storeOpen) {
      notice.innerHTML = `<div class="store-notice danger">🔒 Mağaza şu anda kapalı. Kısa süre içinde tekrar açılacak.</div>`;
    } else {
      notice.innerHTML = `<div class="store-notice">⚡ Teslimatlar Discord üzerinden yapılır. Ödeme sonrası sipariş kodunu <b>#destek</b> kanalına yaz.</div>`;
      notice.querySelector('.store-notice').style.background = 'var(--purple-50)';
      notice.querySelector('.store-notice').style.borderColor = 'var(--purple-200)';
      notice.querySelector('.store-notice').style.color = 'var(--purple-700)';
    }

    const storeClosed = settings.maintenance || !settings.storeOpen;

    const findProduct = (id) => products.find((p) => p.id === id);

    function saveCart() {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartButton();
    }

    function updateCartButton() {
      const count = cart.reduce((sum, item) => sum + item.qty, 0);
      if (countEl) countEl.textContent = String(count);
      const totalEl = document.getElementById('cartTotal');
      const total = cart.reduce((sum, item) => {
        const p = findProduct(item.id);
        return sum + (p ? p.price * item.qty : 0);
      }, 0);
      if (totalEl) totalEl.textContent = CV.money(total);
      renderCartBody();
    }

    function renderProducts() {
      const list = filter === 'Tümü' ? products : products.filter((p) => p.category === filter);
      grid.innerHTML = list.length
        ? list.map((p) => productCard(p)).join('')
        : '<div class="empty-state" style="grid-column:1/-1"><div class="big">🫧</div>Bu kategoride ürün yok.</div>';
      if (storeClosed) {
        grid.querySelectorAll('[data-add]').forEach((btn) => {
          btn.disabled = true;
          btn.textContent = 'Mağaza kapalı';
        });
      }
    }

    function renderCartBody() {
      const body = document.getElementById('cartBody');
      const foot = document.getElementById('cartFoot');
      if (!body) return;

      if (!cart.length) {
        body.innerHTML = `<div class="cart-empty"><div class="big">🛒</div><p>Sepetin henüz boş.</p><p class="small">VIP paketleri veya kasa ekleyerek başla.</p></div>`;
        if (foot) foot.style.display = 'none';
        return;
      }

      body.innerHTML = cart.map((item) => {
        const p = findProduct(item.id);
        if (!p) return '';
        return `
          <div class="cart-item">
            <div class="ci-icon">${CATEGORY_ICON[p.category] || '📦'}</div>
            <div class="ci-main">
              <strong>${CV.esc(p.name)}</strong>
              <small>${CV.esc(p.category)} · ${CV.money(p.price)}</small>
              <div class="qty">
                <button type="button" data-qty="${CV.esc(p.id)}" data-delta="-1" aria-label="Azalt">−</button>
                <span>${item.qty}</span>
                <button type="button" data-qty="${CV.esc(p.id)}" data-delta="1" aria-label="Arttır">+</button>
              </div>
            </div>
            <div class="ci-price">${CV.money(p.price * item.qty)}</div>
          </div>`;
      }).join('');

      if (foot) {
        const total = cart.reduce((sum, item) => sum + (findProduct(item.id)?.price || 0) * item.qty, 0);
        foot.style.display = 'block';
        foot.innerHTML = `
          <div class="cart-total"><span>Toplam</span><strong>${CV.money(total)}</strong></div>
          <button class="btn btn-primary btn-block" type="button" id="checkoutBtn">Satın Al</button>
          <p class="cart-note">Sipariş sonrası teslimat Discord üzerinden yapılır.</p>`;
        document.getElementById('checkoutBtn')?.addEventListener('click', openCheckout);
      }
    }

    function addToCart(id) {
      if (storeClosed) return CV.toast('Mağaza şu anda kapalı.', 'warn');
      const item = cart.find((entry) => entry.id === id);
      if (item) item.qty = Math.min(10, item.qty + 1);
      else cart.push({ id, qty: 1 });
      saveCart();
      const product = findProduct(id);
      CV.toast(`${product ? product.name : 'Ürün'} sepete eklendi.`, 'success', 2200);
    }

    function openCart() {
      document.getElementById('cartBackdrop')?.classList.add('open');
      document.getElementById('cartDrawer')?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeCart() {
      document.getElementById('cartBackdrop')?.classList.remove('open');
      document.getElementById('cartDrawer')?.classList.remove('open');
      document.body.style.overflow = '';
    }

    function openCheckout() {
      closeCart();
      if (!cart.length) return CV.toast('Sepetin boş.', 'warn');
      if (storeClosed) return CV.toast('Mağaza şu anda kapalı.', 'warn');

      const total = cart.reduce((sum, item) => sum + (findProduct(item.id)?.price || 0) * item.qty, 0);
      const summary = cart.map((item) => {
        const p = findProduct(item.id);
        return p ? `<div class="flex" style="justify-content:space-between;gap:12px;font-size:.82rem;padding:4px 0"><span>${CV.esc(p.name)} × ${item.qty}</span><b>${CV.money(p.price * item.qty)}</b></div>` : '';
      }).join('');

      CV.modal({
        title: 'Siparişi tamamla',
        subtitle: 'Teslimat için Minecraft nickini doğru yaz.',
        body: `
          <div class="form-grid">
            <div class="field">
              <label for="coNick">Minecraft Nick <span class="req">*</span></label>
              <input id="coNick" name="nick" maxlength="16" placeholder="OrnekOyuncu" autocomplete="off">
              <span class="err">Geçerli bir nick gir.</span>
            </div>
            <div class="field">
              <label for="coDiscord">Discord <span class="req">*</span></label>
              <input id="coDiscord" name="discord" maxlength="64" placeholder="kullaniciadi" autocomplete="off">
              <span class="err">Discord kullanıcı adını gir.</span>
            </div>
            <div class="field full">
              <label>Ödeme Yöntemi</label>
              <div class="choices">
                <input type="radio" name="method" id="payPapara" value="papara" checked><label for="payPapara">Papara</label>
                <input type="radio" name="method" id="payKart" value="kart"><label for="payKart">Kredi Kartı</label>
                <input type="radio" name="method" id="payHavale" value="havale"><label for="payHavale">Havale</label>
                <input type="radio" name="method" id="payDiscord" value="discord"><label for="payDiscord">Discord</label>
              </div>
            </div>
          </div>
          <div class="mt-16" style="border-top:1px dashed var(--line-2);padding-top:12px">
            ${summary}
            <div class="cart-total" style="margin-top:10px;margin-bottom:0"><span>Toplam</span><strong>${CV.money(total)}</strong></div>
          </div>
          <p class="small muted mt-8">Siparişi oluşturduğunda bir takip kodu alacaksın. Ödeme bilgileri Discord üzerinden paylaşılır.</p>
          <div id="checkoutErr" class="store-notice danger" style="display:none;margin:12px 0 0"></div>`,
        actions: [
          { label: 'Vazgeç', className: 'btn-ghost' },
          {
            label: 'Siparişi Oluştur',
            className: 'btn-primary',
            keepOpen: true,
            onClick: async (ctx) => {
              const nickInput = ctx.body.querySelector('#coNick');
              const discordInput = ctx.body.querySelector('#coDiscord');
              const err = ctx.body.querySelector('#checkoutErr');
              const method = ctx.body.querySelector('input[name="method"]:checked')?.value || 'papara';
              const nick = nickInput.value.trim();
              const discord = discordInput.value.trim();

              const fail = (message, el) => {
                err.textContent = message;
                err.style.display = 'flex';
                el?.focus();
              };
              if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return fail('Geçerli bir Minecraft nick gir (3-16 karakter).', nickInput);
              if (discord.length < 2) return fail('Discord kullanıcı adını gir.', discordInput);

              const btn = ctx.root.querySelector('.modal-foot .btn-primary');
              if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor…'; }
              try {
                const data = await API.post('/orders', { nick, discord, method, items: cart.map((i) => ({ id: i.id, qty: i.qty })) });
                cart = [];
                saveCart();
                renderProducts();
                ctx.close();
                showOrderSuccess(data.order);
                return true;
              } catch (error) {
                fail(error.message || 'Sipariş oluşturulamadı.');
                return false;
              } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Siparişi Oluştur'; }
              }
            }
          }
        ]
      });
    }

    function showOrderSuccess(order) {
      CV.modal({
        title: 'Siparişin alındı! 🎉',
        subtitle: 'Aşağıdaki kodu sakla, teslimat için Discord\'a yaz.',
        body: `
          <div class="success-card card" style="padding:18px;border-radius:14px">
            <div class="small muted">TAKİP KODU</div>
            <div class="success-code"><span>${CV.esc(order.code)}</span><button type="button" data-copy="${CV.esc(order.code)}">Kopyala</button></div>
            <div class="flex" style="justify-content:space-between;gap:10px;font-size:.84rem"><span>${CV.esc(order.nick)}</span><b>${CV.money(order.total)}</b></div>
            <div class="mt-8">${CV.statusBadge(order.status)}</div>
          </div>
          <p class="small muted mt-16">Siparişini bu kodla <b>Mağaza → Sipariş Takip</b> bölümünden sorgulayabilirsin. Ödeme ve teslimat Discord üzerinden yapılır.</p>`,
        actions: [
          { label: 'Siparişi Takip Et', className: 'btn-ghost', onClick: () => {
            document.getElementById('trackForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = document.querySelector('#trackForm input');
            if (input) input.value = order.code;
          } },
          { label: 'Alışverişe Devam', className: 'btn-primary' }
        ]
      });
    }

    /* sepet çekmecesi */
    document.body.insertAdjacentHTML('beforeend', `
      <div class="cart-backdrop" id="cartBackdrop"></div>
      <aside class="cart-drawer" id="cartDrawer" aria-label="Sepet">
        <div class="cart-head">
          <h3>Sepetin</h3>
          <button class="icon-btn" type="button" id="closeCart" aria-label="Sepeti kapat">✕</button>
        </div>
        <div class="cart-body" id="cartBody"></div>
        <div class="cart-foot" id="cartFoot" style="display:none"></div>
      </aside>`);

    document.getElementById('closeCart')?.addEventListener('click', closeCart);
    document.getElementById('cartBackdrop')?.addEventListener('click', closeCart);
    document.getElementById('openCart')?.addEventListener('click', openCart);

    document.getElementById('cartBody')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-qty]');
      if (!btn) return;
      const id = btn.dataset.qty;
      const delta = Number(btn.dataset.delta);
      const item = cart.find((entry) => entry.id === id);
      if (!item) return;
      item.qty += delta;
      if (item.qty <= 0) cart = cart.filter((entry) => entry.id !== id);
      else item.qty = Math.min(10, item.qty);
      saveCart();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCart();
    });

    filters?.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      filter = chip.dataset.filter;
      filters.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderProducts();
    });

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-add]');
      if (!btn || btn.disabled) return;
      addToCart(btn.dataset.add);
    });

    bindTrackForm('trackForm', 'trackResult');

    renderProducts();
    updateCartButton();
  }

  /* ================================================================ */
  /* baltop                                                            */
  /* ================================================================ */

  async function initBaltop() {
    let players = [];
    let totals = {};

    try {
      const data = await API.get('/players?sort=balance');
      players = data.players;
      totals = data.totals;
    } catch (error) {
      CV.toast(error.message, 'error');
    }

    const podium = document.getElementById('podium');
    const top3 = players.slice(0, 3);
    if (podium) {
      if (!top3.length) podium.innerHTML = '<div class="empty-state">Sıralama yüklenemedi.</div>';
      else {
        const order = [top3[1], top3[0], top3[2]].filter(Boolean);
        const cls = (rank) => (rank === 1 ? 'first' : rank === 2 ? 'second' : 'third');
        const crowns = { 1: '👑', 2: '🥈', 3: '🥉' };
        podium.innerHTML = order.map((p) => `
          <article class="podium-card ${cls(p.rank)}">
            <span class="podium-rank">#${p.rank}</span>
            <div class="podium-crown">${crowns[p.rank] || '🏅'}</div>
            <div class="podium-avatar">${CV.initials(p.nick)}</div>
            <h3>${CV.esc(p.nick)}</h3>
            <div class="p-val">${CV.num(p.balance)} CP</div>
            <div class="p-sub">${CV.esc(p.vip === 'Yok' ? 'Oyuncu' : p.vip)} · ${CV.num(p.playtime)} saat</div>
          </article>`).join('');
      }
    }

    const statTotal = document.getElementById('totalMoney');
    const statTop = document.getElementById('topMoney');
    const statPlayers = document.getElementById('totalPlayers');
    if (statTotal) statTotal.textContent = CV.num(totals.balance || players.reduce((s, p) => s + p.balance, 0));
    if (statTop) statTop.textContent = players.length ? CV.num(players[0].balance) : '—';
    if (statPlayers) statPlayers.textContent = CV.num(players.length);

    const tbody = document.getElementById('baltopBody');
    function renderTable(list) {
      if (!tbody) return;
      tbody.innerHTML = list.length ? list.map((p) => `
        <tr data-nick="${CV.esc(p.nick.toLowerCase())}">
          <td><span class="rank ${p.rank <= 3 ? `top${p.rank}` : ''}">#${p.rank}</span></td>
          <td>
            <div class="player-cell">
              <span class="avatar">${CV.initials(p.nick)}</span>
              <span class="who"><strong>${CV.esc(p.nick)}</strong><small>${CV.esc(p.vip === 'Yok' ? 'Oyuncu' : p.vip)}</small></span>
            </div>
          </td>
          <td class="num">${CV.num(p.balance)} <span class="muted" style="font-family:'Plus Jakarta Sans';font-size:.7rem">CP</span></td>
          <td class="num">${CV.num(p.playtime)} sa</td>
          <td>${CV.tierBadge(p.elo)}</td>
          <td class="num">${CV.num(p.elo)}</td>
        </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">Sonuç bulunamadı.</div></td></tr>';
    }

    renderTable(players);

    const search = document.getElementById('playerSearch');
    search?.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      renderTable(q ? players.filter((p) => p.nick.toLowerCase().includes(q)) : players);
    });

    const lookupForm = document.getElementById('lookupForm');
    const lookupResult = document.getElementById('lookupResult');
    lookupForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const nick = lookupForm.querySelector('input').value.trim().toLowerCase();
      if (!nick) return CV.toast('Bir nick yaz.', 'warn');
      const found = players.find((p) => p.nick.toLowerCase() === nick);
      if (!found) {
        lookupResult.innerHTML = `<div class="store-notice danger" style="margin:0">"${CV.esc(nick)}" bulunamadı. Nickini kontrol et.</div>`;
        return;
      }
      const eloRank = players.find((p) => p.id === found.id);
      lookupResult.innerHTML = `
        <div class="flex items-center gap-8" style="flex-wrap:wrap;justify-content:space-between">
          <div class="player-cell">
            <span class="avatar">${CV.initials(found.nick)}</span>
            <span class="who"><strong>${CV.esc(found.nick)}</strong><small>${CV.esc(found.vip === 'Yok' ? 'Oyuncu' : found.vip)}</small></span>
          </div>
          <div class="flex gap-8" style="flex-wrap:wrap">
            <div class="stat-card" style="padding:8px 12px"><small>Baltop</small><strong>#${found.rank}</strong></div>
            <div class="stat-card" style="padding:8px 12px"><small>Bakiye</small><strong>${CV.num(found.balance)} CP</strong></div>
            <div class="stat-card" style="padding:8px 12px"><small>ELO</small><strong>${CV.num(found.elo)}</strong></div>
          </div>
        </div>
        <p class="small muted mt-8">Oynama süresi: ${CV.num(found.playtime)} saat · Katılım: ${CV.date(found.joined).slice(0, 11)}</p>`;
      void eloRank;
    });
  }

  /* ================================================================ */
  /* elo                                                               */
  /* ================================================================ */

  async function initElo() {
    let players = [];
    try {
      const data = await API.get('/players?sort=elo');
      players = data.players;
    } catch (error) {
      CV.toast(error.message, 'error');
    }

    const podium = document.getElementById('podium');
    const top3 = players.slice(0, 3);
    if (podium) {
      if (!top3.length) podium.innerHTML = '<div class="empty-state">Sıralama yüklenemedi.</div>';
      else {
        const order = [top3[1], top3[0], top3[2]].filter(Boolean);
        const cls = (rank) => (rank === 1 ? 'first' : rank === 2 ? 'second' : 'third');
        const crowns = { 1: '👑', 2: '🥈', 3: '🥉' };
        podium.innerHTML = order.map((p) => `
          <article class="podium-card ${cls(p.rank)}">
            <span class="podium-rank">#${p.rank}</span>
            <div class="podium-crown">${crowns[p.rank] || '🏅'}</div>
            <div class="podium-avatar">${CV.initials(p.nick)}</div>
            <h3>${CV.esc(p.nick)}</h3>
            <div class="p-val">${CV.num(p.elo)} ELO</div>
            <div class="p-sub">${CV.tierOf(p.elo).name} · ${CV.num(p.wins)}G / ${CV.num(p.losses)}M</div>
          </article>`).join('');
      }
    }

    const legend = document.getElementById('tierLegend');
    if (legend) {
      legend.innerHTML = CV.TIERS.map((tier) => `
        <div class="feature" style="padding:14px 16px">
          <span class="tier tier-${tier.key}">${tier.name}</span>
          <div class="small muted mt-8">${CV.num(tier.min)} – ${tier.key === 'efsane' ? '2400+' : CV.num(tier.max - 1)} ELO</div>
        </div>`).join('');
    }

    const tbody = document.getElementById('eloBody');
    function renderTable(list) {
      if (!tbody) return;
      tbody.innerHTML = list.length ? list.map((p) => {
        const total = (p.wins || 0) + (p.losses || 0);
        const rate = total ? Math.round((p.wins / total) * 100) : 0;
        return `
          <tr>
            <td><span class="rank ${p.rank <= 3 ? `top${p.rank}` : ''}">#${p.rank}</span></td>
            <td>
              <div class="player-cell">
                <span class="avatar">${CV.initials(p.nick)}</span>
                <span class="who"><strong>${CV.esc(p.nick)}</strong><small>${CV.esc(p.vip === 'Yok' ? 'Oyuncu' : p.vip)}</small></span>
              </div>
            </td>
            <td class="num">${CV.num(p.elo)}</td>
            <td>${CV.tierBadge(p.elo)}</td>
            <td class="num">${CV.num(p.wins)} / ${CV.num(p.losses)}</td>
            <td class="num">%${rate}</td>
          </tr>`;
      }).join('') : '<tr><td colspan="6"><div class="empty-state">Sonuç bulunamadı.</div></td></tr>';
    }

    renderTable(players);

    const search = document.getElementById('playerSearch');
    search?.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      renderTable(q ? players.filter((p) => p.nick.toLowerCase().includes(q)) : players);
    });

    const lookupForm = document.getElementById('lookupForm');
    const lookupResult = document.getElementById('lookupResult');
    lookupForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const nick = lookupForm.querySelector('input').value.trim().toLowerCase();
      if (!nick) return CV.toast('Bir nick yaz.', 'warn');
      const found = players.find((p) => p.nick.toLowerCase() === nick);
      if (!found) {
        lookupResult.innerHTML = `<div class="store-notice danger" style="margin:0">"${CV.esc(nick)}" bulunamadı. Nickini kontrol et.</div>`;
        return;
      }
      const tier = CV.tierOf(found.elo);
      const total = (found.wins || 0) + (found.losses || 0);
      const rate = total ? Math.round((found.wins / total) * 100) : 0;
      lookupResult.innerHTML = `
        <div class="flex items-center gap-8" style="flex-wrap:wrap;justify-content:space-between">
          <div class="player-cell">
            <span class="avatar">${CV.initials(found.nick)}</span>
            <span class="who"><strong>${CV.esc(found.nick)}</strong><small>${CV.esc(found.vip === 'Yok' ? 'Oyuncu' : found.vip)}</small></span>
          </div>
          <div class="flex gap-8" style="flex-wrap:wrap">
            <div class="stat-card" style="padding:8px 12px"><small>Sıra</small><strong>#${found.rank}</strong></div>
            <div class="stat-card" style="padding:8px 12px"><small>ELO</small><strong>${CV.num(found.elo)}</strong></div>
            <div class="stat-card" style="padding:8px 12px"><small>Kazanma</small><strong>%${rate}</strong></div>
          </div>
        </div>
        <div class="flex items-center gap-8 mt-16" style="justify-content:space-between">
          <span>${CV.tierBadge(found.elo)} <b class="small">${tier.name}</b></span>
          <span class="small muted">${tier.next ? `Sonraki tier: ${CV.num(tier.next)} ELO` : 'Zirvedesin!'}</span>
        </div>
        <div class="online-bar mt-8"><span style="width:${tier.progress}%"></span></div>`;
    });

    const seasonEnd = document.getElementById('seasonEnd');
    if (seasonEnd) {
      seasonEnd.textContent = settings.seasonEnds
        ? new Date(settings.seasonEnds).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';
    }
  }

  /* ================================================================ */
  /* başvuru yardımcıları                                              */
  /* ================================================================ */

  const MY_APPS_KEY = 'cv_my_apps';

  function saveMyApp(code) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(MY_APPS_KEY) || '[]'); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    list = [code, ...list.filter((c) => c !== code)].slice(0, 12);
    localStorage.setItem(MY_APPS_KEY, JSON.stringify(list));
  }

  async function renderMyApps() {
    const host = document.getElementById('myApps');
    if (!host) return;
    let codes = [];
    try { codes = JSON.parse(localStorage.getItem(MY_APPS_KEY) || '[]'); } catch { codes = []; }
    if (!Array.isArray(codes) || !codes.length) {
      host.innerHTML = '<p class="small muted">Bu tarayıcıdan henüz bir başvuru yapmadın. Başvuru kodun varsa yukarıdaki takip alanından sorgulayabilirsin.</p>';
      return;
    }
    host.innerHTML = '<p class="small muted">Yükleniyor…</p>';
    const results = await Promise.allSettled(codes.map((code) => API.get(`/track?code=${encodeURIComponent(code)}`)));
    const rows = results
      .filter((r) => r.status === 'fulfilled' && r.value.kind === 'application')
      .map((r) => r.value.application);

    if (!rows.length) {
      host.innerHTML = '<p class="small muted">Kayıt bulunamadı.</p>';
      return;
    }

    host.innerHTML = `<div class="table-wrap" style="margin:0;padding:0"><table class="mini-table">
      <thead><tr><th>Kod</th><th>Tür</th><th>Durum</th><th>Tarih</th></tr></thead>
      <tbody>${rows.map((app) => `
        <tr>
          <td class="mono">${CV.esc(app.code)}</td>
          <td>${app.type === 'media' ? 'Medya' : 'Destek'}</td>
          <td>${CV.statusBadge(app.status)}</td>
          <td class="muted small">${CV.date(app.createdAt).slice(0, 11)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function setInvalid(input, message) {
    const field = input.closest('.field');
    if (!field) return;
    field.classList.add('invalid');
    const err = field.querySelector('.err');
    if (err && message) err.textContent = message;
    input.addEventListener('input', () => field.classList.remove('invalid'), { once: true });
  }

  function bindClearInvalid(form) {
    form.querySelectorAll('input, select, textarea').forEach((input) => {
      input.addEventListener('input', () => input.closest('.field')?.classList.remove('invalid'));
    });
  }

  function successPanel(host, { code, title, message }) {
    host.innerHTML = `
      <div class="success-card card" style="padding:26px;border-radius:18px">
        <div style="font-size:2rem">✅</div>
        <h2 style="margin:8px 0 4px">${CV.esc(title)}</h2>
        <p class="muted" style="font-size:.88rem">${CV.esc(message)}</p>
        <div class="small muted mt-16">BAŞVURU KODUN</div>
        <div class="success-code"><span>${CV.esc(code)}</span><button type="button" data-copy="${CV.esc(code)}">Kopyala</button></div>
        <p class="small muted">Bu kodu sakla. Durumunu <b>Başvuru Takip</b> bölümünden öğrenebilirsin. Yanıtlar Discord üzerinden de iletilecek.</p>
        <div class="form-actions">
          <button class="btn btn-ghost" type="button" onclick="location.reload()">Yeni başvuru</button>
          <a class="btn btn-primary" href="index.html">Anasayfaya dön</a>
        </div>
      </div>`;
  }

  /* ================================================================ */
  /* destek                                                            */
  /* ================================================================ */

  function initSupport() {
    const form = document.getElementById('supportForm');
    if (form) {
      bindClearInvalid(form);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nick = form.nick.value.trim();
        const discord = form.discord.value.trim();
        const category = form.category.value;
        const subject = form.subject.value.trim();
        const message = form.message.value.trim();
        const priority = form.querySelector('input[name="priority"]:checked')?.value || 'normal';
        const terms = form.terms.checked;

        if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) { setInvalid(form.nick, 'Geçerli bir Minecraft nick gir.'); return form.nick.focus(); }
        if (discord.length < 2) { setInvalid(form.discord, 'Discord kullanıcı adını gir.'); return form.discord.focus(); }
        if (!category) { setInvalid(form.category, 'Bir kategori seç.'); return form.category.focus(); }
        if (subject.length < 5) { setInvalid(form.subject, 'Konu en az 5 karakter olmalı.'); return form.subject.focus(); }
        if (message.length < 20) { setInvalid(form.message, 'Mesaj en az 20 karakter olmalı.'); return form.message.focus(); }
        if (!terms) { CV.toast('Devam etmek için kuralları kabul etmelisin.', 'warn'); return; }

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Gönderiliyor…';
        try {
          const data = await API.post('/support', { nick, discord, category, subject, message, priority });
          saveMyApp(data.application.code);
          const card = document.getElementById('supportFormCard');
          successPanel(card, {
            code: data.application.code,
            title: 'Başvurun alındı!',
            message: 'Destek ekibimiz başvurunu inceleyip en kısa sürede dönecek.'
          });
          renderMyApps();
          window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
        } catch (error) {
          CV.toast(error.message, 'error');
          button.disabled = false;
          button.textContent = 'Başvuruyu Gönder';
        }
      });
    }

    const categorySelect = document.getElementById('supportCategory');
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="">Kategori seç…</option>' +
        Object.entries(CV.SUPPORT_CATEGORIES).map(([key, label]) => `<option value="${key}">${CV.esc(label)}</option>`).join('');
    }

    bindTrackForm('trackForm', 'trackResult');
    renderMyApps();
  }

  /* ================================================================ */
  /* medya                                                             */
  /* ================================================================ */

  function initMedia() {
    const form = document.getElementById('mediaForm');
    if (form) {
      bindClearInvalid(form);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nick = form.nick.value.trim();
        const discord = form.discord.value.trim();
        const platform = form.platform.value;
        const channel = form.channel.value.trim();
        const followers = Number(form.followers.value) || 0;
        const contentType = form.contentType.value;
        const about = form.about.value.trim();
        const terms = form.terms.checked;

        if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) { setInvalid(form.nick, 'Geçerli bir Minecraft nick gir.'); return form.nick.focus(); }
        if (discord.length < 2) { setInvalid(form.discord, 'Discord kullanıcı adını gir.'); return form.discord.focus(); }
        if (!platform) { setInvalid(form.platform, 'Bir platform seç.'); return form.platform.focus(); }
        if (!/^https?:\/\/\S+$/i.test(channel)) { setInvalid(form.channel, 'Kanal bağlantısı http(s):// ile başlamalı.'); return form.channel.focus(); }
        if (!(followers >= 0)) { setInvalid(form.followers, 'Geçerli bir takipçi sayısı gir.'); return form.followers.focus(); }
        if (!contentType) { setInvalid(form.contentType, 'İçerik türü seç.'); return form.contentType.focus(); }
        if (about.length < 20) { setInvalid(form.about, 'En az 20 karakterlik bir tanıtım yaz.'); return form.about.focus(); }
        if (!terms) { CV.toast('Devam etmek için kuralları kabul etmelisin.', 'warn'); return; }

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Gönderiliyor…';
        try {
          const data = await API.post('/media', { nick, discord, platform, channel, followers, contentType, about });
          saveMyApp(data.application.code);
          const card = document.getElementById('mediaFormCard');
          successPanel(card, {
            code: data.application.code,
            title: 'Medya başvurun alındı!',
            message: 'Kanalını inceleyip uygun görürsek Discord üzerinden seninle iletişime geçeceğiz.'
          });
          renderMyApps();
          window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
        } catch (error) {
          CV.toast(error.message, 'error');
          button.disabled = false;
          button.textContent = 'Başvuruyu Gönder';
        }
      });
    }

    bindTrackForm('trackForm', 'trackResult');
    renderMyApps();
  }

  /* ================================================================ */
  /* yönlendir                                                         */
  /* ================================================================ */

  try {
    if (page === 'home') initHome();
    else if (page === 'store') await initStore();
    else if (page === 'baltop') await initBaltop();
    else if (page === 'elo') await initElo();
    else if (page === 'support') initSupport();
    else if (page === 'media') initMedia();
  } catch (error) {
    console.error(error);
    CV.toast(error.message || 'Sayfa yüklenirken hata oluştu.', 'error');
  }
})();
