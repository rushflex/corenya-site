'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { newDatabase, hashPassword, verifyPassword } = require('./lib/seed');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Veritabanı                                                          */
/* ------------------------------------------------------------------ */

let db;
try {
  db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.players ||= [];
  db.products ||= [];
  db.orders ||= [];
  db.applications ||= [];
  db.settings ||= {};
} catch {
  db = newDatabase();
  save();
}

function save() {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function fail(res, status, error, extra = {}) {
  json(res, status, { error, ...extra });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 512 * 1024) {
        reject(Object.assign(new Error('İstek çok büyük'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Geçersiz JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const str = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const round = (n) => Math.round(Number(n) * 100) / 100;
const isNick = (value) => /^[A-Za-z0-9_]{3,16}$/.test(value);
const uid = (prefix) => `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
const now = () => new Date().toISOString();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(prefix, length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `${prefix}-${out}`;
}

function publicSettings() {
  const s = db.settings;
  return {
    siteName: s.siteName,
    ip: s.ip,
    port: s.port,
    version: s.version,
    online: s.online,
    maxOnline: s.maxOnline,
    registered: s.registered || 1284,
    discord: s.discord,
    storeOpen: s.storeOpen !== false,
    maintenance: !!s.maintenance,
    season: s.season,
    seasonEnds: s.seasonEnds
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    nick: player.nick,
    balance: player.balance,
    elo: player.elo,
    wins: player.wins || 0,
    losses: player.losses || 0,
    playtime: player.playtime || 0,
    vip: player.vip || 'Yok',
    joined: player.joined
  };
}

function rankedPlayers(sort = 'balance') {
  const key = sort === 'elo' ? 'elo' : 'balance';
  return [...db.players]
    .sort((a, b) => (b[key] || 0) - (a[key] || 0) || a.nick.localeCompare(b.nick, 'tr'))
    .map((player, index) => ({ ...publicPlayer(player), rank: index + 1 }));
}

function publicOrder(order) {
  return {
    id: order.id,
    code: order.code,
    nick: order.nick,
    items: order.items,
    total: order.total,
    method: order.method,
    status: order.status,
    createdAt: order.createdAt
  };
}

function publicApplication(app) {
  return {
    id: app.id,
    code: app.code,
    type: app.type,
    nick: app.nick,
    category: app.category,
    subject: app.subject,
    message: app.message,
    priority: app.priority,
    platform: app.platform,
    channel: app.channel,
    followers: app.followers,
    contentType: app.contentType,
    about: app.about,
    status: app.status,
    reply: app.reply,
    createdAt: app.createdAt,
    reviewedAt: app.reviewedAt
  };
}

/* ------------------------------------------------------------------ */
/* Oturum + hız limiti                                                 */
/* ------------------------------------------------------------------ */

const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username: db.settings.admin.username, expires: Date.now() + SESSION_TTL });
  return token;
}

function getSession(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL;
  return session;
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    fail(res, 401, 'Oturum süresi doldu, lütfen tekrar giriş yapın.');
    return null;
  }
  return session;
}

/* Ters proxy (nginx/Caddy) arkasinda gercek ziyaretci IP'sini bulur.
   Basliklara yalnizca baglanti yerel proxy'den geliyorsa guvenilir. */
function clientIp(req) {
  const direct = req.socket.remoteAddress || '';
  const isLocal = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
  if (isLocal) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim();
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const hops = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
      if (hops.length) return hops[hops.length - 1];
    }
  }
  return direct || 'local';
}

const buckets = new Map();
function rateLimited(key, max, windowMs) {
  const t = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.reset < t) {
    buckets.set(key, { count: 1, reset: t + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

setInterval(() => {
  const t = Date.now();
  for (const [key, session] of sessions) if (session.expires < t) sessions.delete(key);
  for (const [key, entry] of buckets) if (entry.reset < t) buckets.delete(key);
}, 10 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function api(req, res, pathname, query) {
  const method = req.method;
  const ip = clientIp(req);

  /* --- genel --- */

  if (method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, time: now() });
  }

  if (method === 'GET' && pathname === '/api/site') {
    return json(res, 200, {
      settings: publicSettings(),
      stats: {
        registered: db.settings.registered || 1284,
        pending: db.applications.filter((a) => a.status === 'pending').length,
        approved: db.applications.filter((a) => a.status === 'approved').length,
        orders: db.orders.length
      },
      topBalance: rankedPlayers('balance').slice(0, 5),
      topElo: rankedPlayers('elo').slice(0, 5),
      featured: db.products.filter((p) => p.active !== false && p.featured).sort((a, b) => a.sort - b.sort).slice(0, 3),
      categories: ['VIP', 'Kasa', 'Kredi', 'Unvan']
    });
  }

  if (method === 'GET' && pathname === '/api/products') {
    return json(res, 200, {
      settings: publicSettings(),
      products: db.products
        .filter((p) => p.active !== false)
        .sort((a, b) => a.sort - b.sort)
    });
  }

  if (method === 'GET' && pathname === '/api/players') {
    const sort = query.get('sort') === 'elo' ? 'elo' : 'balance';
    const q = str(query.get('q'), 32).toLowerCase();
    let players = rankedPlayers(sort);
    if (q) players = players.filter((p) => p.nick.toLowerCase().includes(q));
    return json(res, 200, {
      sort,
      players,
      updatedAt: now(),
      totals: {
        balance: db.players.reduce((sum, p) => sum + (p.balance || 0), 0),
        avgElo: Math.round(db.players.reduce((sum, p) => sum + (p.elo || 0), 0) / (db.players.length || 1))
      }
    });
  }

  const playerMatch = pathname.match(/^\/api\/players\/([A-Za-z0-9_]{3,16})$/);
  if (method === 'GET' && playerMatch) {
    const nick = playerMatch[1].toLowerCase();
    const all = rankedPlayers('balance');
    const found = all.find((p) => p.nick.toLowerCase() === nick);
    if (!found) return fail(res, 404, 'Oyuncu bulunamadı.');
    const eloRank = rankedPlayers('elo').find((p) => p.id === found.id)?.rank ?? null;
    return json(res, 200, { player: found, eloRank });
  }

  if (method === 'POST' && pathname === '/api/orders') {
    if (db.settings.maintenance) return fail(res, 503, 'Sunucu bakımda, mağaza geçici olarak kapalı.');
    if (db.settings.storeOpen === false) return fail(res, 403, 'Mağaza şu anda kapalı.');
    if (rateLimited(`order:${ip}`, 12, 10 * 60 * 1000)) return fail(res, 429, 'Çok fazla sipariş denemesi. Lütfen biraz bekleyin.');

    const body = await readJson(req);
    const nick = str(body.nick, 16);
    const discord = str(body.discord, 64);
    const methodName = str(body.method, 16);
    if (!isNick(nick)) return fail(res, 400, 'Geçerli bir Minecraft nick gir (3-16 karakter, harf/rakam/alt çizgi).');
    if (!['papara', 'kart', 'havale', 'discord'].includes(methodName)) return fail(res, 400, 'Geçersiz ödeme yöntemi.');
    if (!Array.isArray(body.items) || !body.items.length) return fail(res, 400, 'Sepetin boş.');

    const items = [];
    for (const raw of body.items.slice(0, 10)) {
      const product = db.products.find((p) => p.id === raw.id && p.active !== false);
      if (!product) return fail(res, 400, 'Sepette geçersiz bir ürün var.');
      const qty = Math.max(1, Math.min(10, Number(raw.qty) || 1));
      items.push({ productId: product.id, name: product.name, price: product.price, qty });
    }
    const total = round(items.reduce((sum, item) => sum + item.price * item.qty, 0));
    let orderCode;
    do { orderCode = code('CV'); } while (db.orders.some((o) => o.code === orderCode));

    const order = {
      id: uid('ord'), code: orderCode, nick, discord, method: methodName,
      items, total, status: 'pending', createdAt: now()
    };
    db.orders.unshift(order);
    save();
    return json(res, 201, { order: publicOrder(order), message: 'Sipariş oluşturuldu. Teslimat için Discord\'a bekleniyorsun.' });
  }

  if (method === 'POST' && pathname === '/api/support') {
    if (rateLimited(`support:${ip}`, 6, 10 * 60 * 1000)) return fail(res, 429, 'Çok fazla başvuru gönderdin. Lütfen biraz bekleyin.');
    const body = await readJson(req);
    const nick = str(body.nick, 16);
    const discord = str(body.discord, 64);
    const category = str(body.category, 24);
    const subject = str(body.subject, 120);
    const message = str(body.message, 2500);
    const priority = str(body.priority, 10) || 'normal';
    const categories = ['hata', 'item', 'sikayet', 'ceza', 'odeme', 'oneri', 'diger'];

    if (!isNick(nick)) return fail(res, 400, 'Geçerli bir Minecraft nick gir.');
    if (!discord) return fail(res, 400, 'Discord kullanıcı adı gerekli.');
    if (!categories.includes(category)) return fail(res, 400, 'Geçerli bir kategori seç.');
    if (subject.length < 5) return fail(res, 400, 'Konu en az 5 karakter olmalı.');
    if (message.length < 20) return fail(res, 400, 'Mesaj en az 20 karakter olmalı.');
    if (!['normal', 'high', 'urgent'].includes(priority)) return fail(res, 400, 'Geçersiz öncelik.');

    const app = {
      id: uid('app'), code: code('DS', 4), type: 'support', nick, discord,
      category, subject, message, priority, platform: null, channel: null,
      followers: null, contentType: null, about: null,
      status: 'pending', reply: null, createdAt: now(), reviewedAt: null
    };
    db.applications.unshift(app);
    save();
    return json(res, 201, {
      application: { id: app.id, code: app.code, type: app.type, status: app.status, createdAt: app.createdAt },
      message: 'Destek başvurun alındı. Başvuru kodunla durumunu takip edebilirsin.'
    });
  }

  if (method === 'POST' && pathname === '/api/media') {
    if (rateLimited(`media:${ip}`, 6, 10 * 60 * 1000)) return fail(res, 429, 'Çok fazla başvuru gönderdin. Lütfen biraz bekleyin.');
    const body = await readJson(req);
    const nick = str(body.nick, 16);
    const discord = str(body.discord, 64);
    const platform = str(body.platform, 16);
    const channel = str(body.channel, 200);
    const followers = Math.max(0, Math.min(100000000, Number(body.followers) || 0));
    const contentType = str(body.contentType, 16);
    const about = str(body.about, 2500);
    const platforms = ['youtube', 'twitch', 'tiktok', 'instagram', 'kick', 'diger'];
    const types = ['video', 'shorts', 'yayin', 'blog'];

    if (!isNick(nick)) return fail(res, 400, 'Geçerli bir Minecraft nick gir.');
    if (!discord) return fail(res, 400, 'Discord kullanıcı adı gerekli.');
    if (!platforms.includes(platform)) return fail(res, 400, 'Geçerli bir platform seç.');
    if (!/^https?:\/\/\S+$/i.test(channel)) return fail(res, 400, 'Kanal bağlantısı http(s):// ile başlamalı.');
    if (!types.includes(contentType)) return fail(res, 400, 'İçerik türü geçersiz.');
    if (about.length < 20) return fail(res, 400, 'Kendini tanıtan metin en az 20 karakter olmalı.');

    const app = {
      id: uid('app'), code: code('MD', 4), type: 'media', nick, discord,
      platform, channel, followers, contentType, about,
      category: null, subject: null, message: null, priority: null,
      status: 'pending', reply: null, createdAt: now(), reviewedAt: null
    };
    db.applications.unshift(app);
    save();
    return json(res, 201, {
      application: { id: app.id, code: app.code, type: app.type, status: app.status, createdAt: app.createdAt },
      message: 'Medya başvurun alındı. Ekibimiz kanalını inceleyip Discord üzerinden dönüş yapacak.'
    });
  }

  if (method === 'GET' && pathname === '/api/track') {
    const trackCode = str(query.get('code'), 24).toUpperCase();
    if (!trackCode) return fail(res, 400, 'Takip kodu gerekli.');
    const order = db.orders.find((o) => o.code === trackCode);
    if (order) return json(res, 200, { kind: 'order', order: publicOrder(order) });
    const app = db.applications.find((a) => a.code === trackCode);
    if (app) {
      return json(res, 200, {
        kind: 'application',
        application: {
          code: app.code, type: app.type, nick: app.nick, status: app.status,
          subject: app.subject, platform: app.platform, channel: app.channel,
          reply: app.reply, createdAt: app.createdAt, reviewedAt: app.reviewedAt
        }
      });
    }
    return fail(res, 404, 'Bu koda ait bir kayıt bulunamadı.');
  }

  /* --- oturum --- */

  if (method === 'POST' && pathname === '/api/auth/login') {
    if (rateLimited(`login:${ip}`, 8, 10 * 60 * 1000)) return fail(res, 429, 'Çok fazla giriş denemesi. 10 dakika sonra tekrar deneyin.');
    const body = await readJson(req);
    const username = str(body.username, 40);
    const password = String(body.password ?? '');
    const admin = db.settings.admin;
    if (!admin || username !== admin.username || !verifyPassword(password, admin.salt, admin.hash)) {
      return fail(res, 401, 'Kullanıcı adı veya şifre hatalı.');
    }
    const token = createSession();
    return json(res, 200, { token, username: admin.username, expiresIn: SESSION_TTL });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const session = requireAuth(req, res);
    if (!session) return;
    return json(res, 200, { username: session.username });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) sessions.delete(header.slice(7).trim());
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/auth/password') {
    const session = requireAuth(req, res);
    if (!session) return;
    const body = await readJson(req);
    const current = String(body.current ?? '');
    const next = String(body.next ?? '');
    if (!verifyPassword(current, db.settings.admin.salt, db.settings.admin.hash)) {
      return fail(res, 400, 'Mevcut şifre hatalı.');
    }
    if (next.length < 8) return fail(res, 400, 'Yeni şifre en az 8 karakter olmalı.');
    db.settings.admin = { username: db.settings.admin.username, ...hashPassword(next) };
    save();
    sessions.clear();
    return json(res, 200, { message: 'Şifre güncellendi, tekrar giriş yapın.' });
  }

  /* --- admin --- */

  if (pathname.startsWith('/api/admin/')) {
    if (!requireAuth(req, res)) return;

    if (method === 'GET' && pathname === '/api/admin/overview') {
      const paid = db.orders.filter((o) => ['paid', 'delivered'].includes(o.status));
      const revenue = round(paid.reduce((sum, o) => sum + o.total, 0));
      const today = new Date().toISOString().slice(0, 10);
      return json(res, 200, {
        counts: {
          players: db.players.length,
          applications: db.applications.length,
          pendingApplications: db.applications.filter((a) => a.status === 'pending').length,
          approvedApplications: db.applications.filter((a) => a.status === 'approved').length,
          orders: db.orders.length,
          pendingOrders: db.orders.filter((o) => o.status === 'pending').length,
          products: db.products.length
        },
        revenue,
        todayRevenue: round(paid.filter((o) => (o.createdAt || '').slice(0, 10) === today).reduce((sum, o) => sum + o.total, 0)),
        recentApplications: [...db.applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(publicApplication),
        recentOrders: db.orders.slice(0, 6).map(publicOrder),
        settings: publicSettings()
      });
    }

    if (method === 'GET' && pathname === '/api/admin/applications') {
      const type = str(query.get('type'), 10);
      const status = str(query.get('status'), 10);
      const q = str(query.get('q'), 32).toLowerCase();
      let list = [...db.applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (type && type !== 'all') list = list.filter((a) => a.type === type);
      if (status && status !== 'all') list = list.filter((a) => a.status === status);
      if (q) list = list.filter((a) => `${a.nick} ${a.code} ${a.subject || ''} ${a.discord}`.toLowerCase().includes(q));
      return json(res, 200, { applications: list });
    }

    const reviewMatch = pathname.match(/^\/api\/admin\/applications\/([\w-]+)\/review$/);
    if (method === 'POST' && reviewMatch) {
      const app = db.applications.find((a) => a.id === reviewMatch[1]);
      if (!app) return fail(res, 404, 'Başvuru bulunamadı.');
      const body = await readJson(req);
      const action = str(body.action, 16);
      const reply = str(body.reply, 1200);
      if (!['approved', 'rejected'].includes(action)) return fail(res, 400, 'Geçersiz işlem.');
      if (action === 'rejected' && reply.length < 3) return fail(res, 400, 'Reddederken kısa bir gerekçe yazın.');
      app.status = action;
      app.reply = reply || null;
      app.reviewedAt = now();
      save();
      return json(res, 200, { application: publicApplication(app), message: action === 'approved' ? 'Başvuru onaylandı.' : 'Başvuru reddedildi.' });
    }

    const deleteAppMatch = pathname.match(/^\/api\/admin\/applications\/([\w-]+)$/);
    if (method === 'DELETE' && deleteAppMatch) {
      const index = db.applications.findIndex((a) => a.id === deleteAppMatch[1]);
      if (index < 0) return fail(res, 404, 'Başvuru bulunamadı.');
      db.applications.splice(index, 1);
      save();
      return json(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/api/admin/orders') {
      const status = str(query.get('status'), 12);
      const q = str(query.get('q'), 32).toLowerCase();
      let list = [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (status && status !== 'all') list = list.filter((o) => o.status === status);
      if (q) list = list.filter((o) => `${o.code} ${o.nick} ${o.discord || ''}`.toLowerCase().includes(q));
      return json(res, 200, { orders: list.map(publicOrder) });
    }

    const orderStatusMatch = pathname.match(/^\/api\/admin\/orders\/([\w-]+)\/status$/);
    if (method === 'POST' && orderStatusMatch) {
      const order = db.orders.find((o) => o.id === orderStatusMatch[1]);
      if (!order) return fail(res, 404, 'Sipariş bulunamadı.');
      const body = await readJson(req);
      const status = str(body.status, 12);
      if (!['pending', 'paid', 'delivered', 'cancelled'].includes(status)) return fail(res, 400, 'Geçersiz sipariş durumu.');
      order.status = status;
      save();
      return json(res, 200, { order: publicOrder(order), message: 'Sipariş durumu güncellendi.' });
    }

    if (method === 'GET' && pathname === '/api/admin/players') {
      const q = str(query.get('q'), 32).toLowerCase();
      let list = rankedPlayers('balance');
      if (q) list = list.filter((p) => p.nick.toLowerCase().includes(q));
      return json(res, 200, { players: list });
    }

    if (method === 'POST' && pathname === '/api/admin/players') {
      const body = await readJson(req);
      const nick = str(body.nick, 16);
      if (!isNick(nick)) return fail(res, 400, 'Geçerli bir nick girin.');
      if (db.players.some((p) => p.nick.toLowerCase() === nick.toLowerCase())) return fail(res, 409, 'Bu nick zaten kayıtlı.');
      const player = {
        id: uid('pl'), nick,
        balance: Math.max(0, Number(body.balance) || 0),
        elo: Math.max(0, Math.min(4000, Number(body.elo) || 1000)),
        wins: 0, losses: 0,
        playtime: Math.max(0, Number(body.playtime) || 0),
        vip: str(body.vip, 20) || 'Yok',
        joined: now(), lastSeen: now()
      };
      db.players.push(player);
      save();
      return json(res, 201, { player: publicPlayer(player) });
    }

    const playerIdMatch = pathname.match(/^\/api\/admin\/players\/([\w-]+)$/);
    if ((method === 'PUT' || method === 'DELETE') && playerIdMatch) {
      const index = db.players.findIndex((p) => p.id === playerIdMatch[1]);
      if (index < 0) return fail(res, 404, 'Oyuncu bulunamadı.');
      if (method === 'DELETE') {
        db.players.splice(index, 1);
        save();
        return json(res, 200, { ok: true });
      }
      const body = await readJson(req);
      const player = db.players[index];
      if (body.balance !== undefined) player.balance = Math.max(0, Number(body.balance) || 0);
      if (body.elo !== undefined) player.elo = Math.max(0, Math.min(4000, Number(body.elo) || 0));
      if (body.playtime !== undefined) player.playtime = Math.max(0, Number(body.playtime) || 0);
      if (body.vip !== undefined) player.vip = str(body.vip, 20) || 'Yok';
      save();
      return json(res, 200, { player: publicPlayer(player) });
    }

    if (method === 'GET' && pathname === '/api/admin/products') {
      return json(res, 200, { products: [...db.products].sort((a, b) => a.sort - b.sort) });
    }

    if (method === 'POST' && pathname === '/api/admin/products') {
      const body = await readJson(req);
      const name = str(body.name, 60);
      const category = str(body.category, 12);
      const price = Number(body.price);
      if (!name) return fail(res, 400, 'Ürün adı gerekli.');
      if (!['VIP', 'Kasa', 'Kredi', 'Unvan'].includes(category)) return fail(res, 400, 'Geçersiz kategori.');
      if (!(price > 0)) return fail(res, 400, 'Geçerli bir fiyat girin.');
      const product = {
        id: `${category.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`,
        name, category, price: round(price),
        oldPrice: body.oldPrice ? round(Number(body.oldPrice)) : null,
        desc: str(body.desc, 400),
        perks: Array.isArray(body.perks) ? body.perks.map((p) => str(p, 80)).filter(Boolean).slice(0, 8) : [],
        badge: str(body.badge, 30) || null,
        featured: !!body.featured,
        active: body.active !== false,
        sort: Number(body.sort) || db.products.length * 10 + 10
      };
      db.products.push(product);
      save();
      return json(res, 201, { product });
    }

    const productIdMatch = pathname.match(/^\/api\/admin\/products\/([\w-]+)$/);
    if ((method === 'PUT' || method === 'DELETE') && productIdMatch) {
      const index = db.products.findIndex((p) => p.id === productIdMatch[1]);
      if (index < 0) return fail(res, 404, 'Ürün bulunamadı.');
      if (method === 'DELETE') {
        db.products.splice(index, 1);
        save();
        return json(res, 200, { ok: true });
      }
      const body = await readJson(req);
      const product = db.products[index];
      if (body.name !== undefined) product.name = str(body.name, 60);
      if (body.category !== undefined && ['VIP', 'Kasa', 'Kredi', 'Unvan'].includes(body.category)) product.category = body.category;
      if (body.price !== undefined) product.price = round(Math.max(0.01, Number(body.price) || product.price));
      if (body.oldPrice !== undefined) product.oldPrice = body.oldPrice ? round(Number(body.oldPrice)) : null;
      if (body.desc !== undefined) product.desc = str(body.desc, 400);
      if (body.perks !== undefined) product.perks = Array.isArray(body.perks) ? body.perks.map((p) => str(p, 80)).filter(Boolean).slice(0, 8) : [];
      if (body.badge !== undefined) product.badge = str(body.badge, 30) || null;
      if (body.featured !== undefined) product.featured = !!body.featured;
      if (body.active !== undefined) product.active = !!body.active;
      if (body.sort !== undefined) product.sort = Number(body.sort) || product.sort;
      save();
      return json(res, 200, { product });
    }

    if (method === 'GET' && pathname === '/api/admin/settings') {
      return json(res, 200, { settings: { ...publicSettings(), adminUser: db.settings.admin.username } });
    }

    if (method === 'PUT' && pathname === '/api/admin/settings') {
      const body = await readJson(req);
      const s = db.settings;
      if (body.siteName !== undefined) s.siteName = str(body.siteName, 40) || s.siteName;
      if (body.ip !== undefined) s.ip = str(body.ip, 80) || s.ip;
      if (body.port !== undefined) s.port = Math.max(1, Math.min(65535, Number(body.port) || s.port));
      if (body.version !== undefined) s.version = str(body.version, 20) || s.version;
      if (body.online !== undefined) s.online = Math.max(0, Number(body.online) || 0);
      if (body.maxOnline !== undefined) s.maxOnline = Math.max(1, Number(body.maxOnline) || 1);
      if (body.registered !== undefined) s.registered = Math.max(0, Number(body.registered) || 0);
      if (body.discord !== undefined) s.discord = str(body.discord, 200) || s.discord;
      if (body.storeOpen !== undefined) s.storeOpen = !!body.storeOpen;
      if (body.maintenance !== undefined) s.maintenance = !!body.maintenance;
      if (body.season !== undefined) s.season = str(body.season, 30) || s.season;
      if (body.seasonEnds !== undefined) s.seasonEnds = str(body.seasonEnds, 10) || s.seasonEnds;
      save();
      return json(res, 200, { settings: { ...publicSettings(), adminUser: s.admin.username }, message: 'Ayarlar kaydedildi.' });
    }

    if (method === 'GET' && pathname === '/api/admin/export') {
      const body = JSON.stringify({ ...db, exportedAt: now() }, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="corenya-yedek-${new Date().toISOString().slice(0, 10)}.json"`
      });
      return res.end(body);
    }

    if (method === 'POST' && pathname === '/api/admin/import') {
      const body = await readJson(req);
      const data = body.data;
      if (!data || !data.settings || !Array.isArray(data.players) || !Array.isArray(data.products)) {
        return fail(res, 400, 'Yedek dosyası geçersiz.');
      }
      if (!data.settings.admin || !data.settings.admin.salt || !data.settings.admin.hash) {
        return fail(res, 400, 'Yedekte admin bilgisi yok.');
      }
      db = {
        ...newDatabase(),
        ...data,
        settings: { ...newDatabase().settings, ...data.settings }
      };
      save();
      sessions.clear();
      return json(res, 200, { message: 'Yedek geri yüklendi. Lütfen tekrar giriş yapın.' });
    }

    if (method === 'POST' && pathname === '/api/admin/reset') {
      const admin = db.settings.admin;
      db = newDatabase();
      db.settings.admin = admin;
      save();
      sessions.clear();
      return json(res, 200, { message: 'Demo verileri sıfırlandı. Tekrar giriş yapın.' });
    }
  }

  return fail(res, 404, 'API yolu bulunamadı.');
}

/* ------------------------------------------------------------------ */
/* Statik dosyalar                                                     */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return fail(res, 400, 'Geçersiz adres.');
  }
  if (rel === '/') rel = '/index.html';
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) return fail(res, 403, 'Erişim reddedildi.');

  try {
    let stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = fs.statSync(filePath);
    }
  } catch {
    if (!path.extname(filePath)) {
      const withHtml = `${filePath}.html`;
      if (fs.existsSync(withHtml)) filePath = withHtml;
      else return send404(res);
    } else {
      return send404(res);
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': fs.statSync(filePath).size,
    'Cache-Control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function send404(res) {
  const page = path.join(PUBLIC_DIR, '404.html');
  if (fs.existsSync(page)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(page).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  return res.end('404 - Sayfa bulunamadı');
}

/* ------------------------------------------------------------------ */
/* Sunucu                                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      await api(req, res, pathname, url.searchParams);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return fail(res, 405, 'Yöntem desteklenmiyor.');
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[site]', error);
    if (!res.headersSent) {
      fail(res, error.status || 500, error.status ? error.message : 'Sunucu hatası oluştu.');
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Corenya Vanilla — Web Sitesi');
  console.log(`  Yerel:    http://localhost:${PORT}`);
  console.log(`  Admin:    http://localhost:${PORT}/admin.html  (admin / corenya123)`);
  console.log(`  Veri:     ${DB_PATH}`);
  console.log('  Kapatmak için Ctrl + C');
  console.log('');
});
