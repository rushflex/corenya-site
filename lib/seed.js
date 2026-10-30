'use strict';

const crypto = require('node:crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expected) {
  try {
    const actual = crypto.scryptSync(String(password), salt, 64);
    const target = Buffer.from(expected, 'hex');
    return actual.length === target.length && crypto.timingSafeEqual(actual, target);
  } catch {
    return false;
  }
}

const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();

const PLAYERS = [
  ['RushFlex', 12485300, 2380, 412, 118, 'VIP Elmas', 420],
  ['Smorkiq', 9842750, 2265, 388, 96, 'VIP Elmas', 390],
  ['Wroxz', 8120400, 2190, 361, 104, 'VIP Altın', 366],
  ['EfsaneMaden', 7456900, 2085, 340, 88, 'VIP Altın', 340],
  ['xNova', 6890250, 1990, 322, 71, 'VIP Gümüş', 312],
  ['AtesKusu', 5940100, 1920, 305, 64, 'VIP Gümüş', 298],
  ['Moonlight', 5120880, 1855, 288, 59, 'VIP Bronz', 281],
  ['KralYusuf', 4640300, 1780, 270, 55, 'VIP Gümüş', 266],
  ['LavKral', 4210700, 1710, 251, 61, 'Yok', 254],
  ['Ayaz', 3860450, 1650, 236, 49, 'VIP Bronz', 240],
  ['Zeynep', 3540000, 1585, 219, 44, 'VIP Gümüş', 228],
  ['BetonKar', 3120990, 1520, 204, 41, 'Yok', 215],
  ['creeperPro', 2870450, 1465, 191, 38, 'VIP Bronz', 201],
  ['sessizKedi', 2610300, 1400, 177, 36, 'Yok', 189],
  ['Dervish', 2390540, 1345, 165, 33, 'VIP Bronz', 176],
  ['Emirhan', 2120000, 1290, 152, 30, 'Yok', 161],
  ['PvPGod', 1940700, 1230, 140, 28, 'Yok', 150],
  ['DerinSular', 1750300, 1175, 128, 26, 'VIP Bronz', 139],
  ['BuzPrensi', 1560800, 1120, 116, 23, 'Yok', 127],
  ['TurkMT', 1320450, 1050, 104, 21, 'Yok', 118]
];

function seedPlayers() {
  return PLAYERS.map((row, index) => {
    const [nick, balance, elo, wins, losses, vip, hours] = row;
    return {
      id: `pl_${String(index + 1).padStart(3, '0')}`,
      nick,
      balance,
      elo,
      wins,
      losses,
      playtime: hours,
      vip,
      joined: ago(120 - index * 4, index),
      lastSeen: ago(0, index + 1)
    };
  });
}

function seedProducts() {
  return [
    {
      id: 'vip-bronz', name: 'VIP Bronz', category: 'VIP', price: 49.9, oldPrice: 69.9,
      desc: 'Sunucuya tatlı bir giriş yap. Sohbette renkli görün, temel VIP komutlarını kullan.',
      perks: ['Renkli sohbet etiketi', '/kit vip (7 gün)', '2x kasa anahtarı', 'Lobide /fly'],
      badge: 'Başlangıç', featured: false, active: true, sort: 10
    },
    {
      id: 'vip-gumus', name: 'VIP Gümüş', category: 'VIP', price: 99.9, oldPrice: 129.9,
      desc: 'En dengeli paket. Ekstra kasa, ev limiti ve öncelikli destek seni bekliyor.',
      perks: ['Tüm Bronz ayrıcalıkları', '/kit vip+ (14 gün)', '5 ev limiti', 'Öncelikli destek', 'Haftalık 5x kasa'],
      badge: 'Popüler', featured: true, active: true, sort: 20
    },
    {
      id: 'vip-altin', name: 'VIP Altın', category: 'VIP', price: 179.9, oldPrice: 229.9,
      desc: 'Ciddi oyuncular için. ELO kaybı koruması ve özel sohbet unvanı dahil.',
      perks: ['Tüm Gümüş ayrıcalıkları', '/kit vip++ (30 gün)', '10 ev limiti', 'ELO kayıp koruması (haftada 2)', 'Özel sohbet unvanı', 'Sunucuya öncelikli giriş'],
      badge: 'En Çok Tercih Edilen', featured: true, popular: true, active: true, sort: 30
    },
    {
      id: 'vip-elmas', name: 'VIP Elmas', category: 'VIP', price: 299.9, oldPrice: 399.9,
      desc: 'Sunucunun en üst paketi. Kalıcı etiket, tüm kozmetikler ve ayrıcalıklar.',
      perks: ['Tüm Altın ayrıcalıkları', 'Kalıcı VIP etiketi', 'Sınırsız ev', 'Tüm kozmetikler açık', 'Kendi /warp alanı', 'Discord özel rol'],
      badge: 'Efsane', featured: false, active: true, sort: 40
    },
    {
      id: 'kasa-efsane', name: 'Efsanevi Kasa x1', category: 'Kasa', price: 39.9, oldPrice: null,
      desc: 'İçinden ELO puanı, nadir eşya veya Corenya Parası çıkabilen şans kasası.',
      perks: ['1 adet Efsanevi Kasa', 'Anında teslimat', 'Tüm kasalarda geçerli'],
      badge: null, featured: false, active: true, sort: 50
    },
    {
      id: 'kasa-efsane-5', name: 'Efsanevi Kasa x5', category: 'Kasa', price: 169.9, oldPrice: 199.5,
      desc: 'Beşli paket ile avantajlı fiyat. Kasa açılışlarında ekstra şans bonusu.',
      perks: ['5 adet Efsanevi Kasa', '%15 tasarruf', '1 ekstra şans bonusu', 'Anında teslimat'],
      badge: 'Avantajlı', featured: true, active: true, sort: 60
    },
    {
      id: 'kredi-500', name: '500 Corenya Parası', category: 'Kredi', price: 59.9, oldPrice: null,
      desc: 'Oyun içi para yükle. Baltop sıralamasında hızla yüksel.',
      perks: ['500 CP bakiyene eklenir', 'Anında teslimat', 'Baltop\'a yansır'],
      badge: null, featured: false, active: true, sort: 70
    },
    {
      id: 'kredi-1500', name: '1500 Corenya Parası', category: 'Kredi', price: 149.9, oldPrice: 179.7,
      desc: 'Üçlü kredi paketi. Toplamda 300 CP bonus kazan.',
      perks: ['1500 CP + 300 CP bonus', '%16 tasarruf', 'Anında teslimat', 'Baltop\'a yansır'],
      badge: 'Bonuslu', featured: false, active: true, sort: 80
    },
    {
      id: 'unvan-ozel', name: 'Özel Sohbet Unvanı', category: 'Unvan', price: 79.9, oldPrice: null,
      desc: 'Sohbette adının yanında görünecek, rengini kendin seçebileceğin unvan.',
      perks: ['Kendi unvan metnin', 'Renk seçimi', 'Kalıcı', 'Discord rolü'],
      badge: null, featured: false, active: true, sort: 90
    },
    {
      id: 'warp-ozel', name: 'Özel Warp Alanı', category: 'Unvan', price: 129.9, oldPrice: null,
      desc: 'Haritada kendine ait bir nokta oluştur, arkadaşlarını oraya ışınla.',
      perks: ['Kişisel /warp', 'Ziyaretçi izinleri', 'Blok koruması', '5 kişi limiti'],
      badge: null, featured: false, active: true, sort: 100
    }
  ];
}

function seedApplications() {
  return [
    {
      id: 'app_1001', code: 'DS-1042', type: 'support', nick: 'EfsaneMaden', discord: 'efsanemaden',
      category: 'item', subject: 'Envanterimdeki eşyalar kayboldu',
      message: 'Dün gece sunucudan çıktığımda envanterimde elmas kılıç ve 3 stack demir vardı. Sabah girdiğimde envanterim boştu. Son işlem olarak sandığa eşya koymuştum. Kontrol edebilir misiniz?',
      priority: 'high', status: 'pending', reply: null, createdAt: ago(0, 3), reviewedAt: null
    },
    {
      id: 'app_1002', code: 'DS-1041', type: 'support', nick: 'BuzPrensi', discord: 'buzprensi',
      category: 'sikayet', subject: 'Hile şüphesi: KillAura',
      message: 'PvP arenasında "PvPGod" isimli oyuncu arkamı dönmeme rağmen sürekli vuruyor. 3 maçtır aynı durum var. Ekran kaydı ve saat bilgisi paylaşabilirim. Kontrol ederseniz sevinirim.',
      priority: 'urgent', status: 'pending', reply: null, createdAt: ago(0, 6), reviewedAt: null
    },
    {
      id: 'app_1003', code: 'DS-1038', type: 'support', nick: 'Ayaz', discord: 'ayaz.exe',
      category: 'odome', subject: 'VIP satın aldım ama gelmedi',
      message: 'Mağazadan VIP Gümüş aldım, ödeme sayfası başarılı dedi fakat oyunda hâlâ VIP değilim. Sipariş kodum CV-8H2K4L. Yardımcı olur musunuz?',
      priority: 'high', status: 'pending', reply: null, createdAt: ago(1, 2), reviewedAt: null
    },
    {
      id: 'app_1004', code: 'DS-1029', type: 'support', nick: 'sessizKedi', discord: 'sessizkedi',
      category: 'hata', subject: 'Warp komutu çalışmıyor',
      message: 'Oyun içinde /warp pazar yazdığımda "bilinmeyen komut" hatası alıyorum. Diğer oyuncularda çalışıyor, sadece bende sorun var sanırım.',
      priority: 'normal', status: 'approved', reply: 'Warp izinlerin güncellendi, tekrar dener misin? Sorun devam ederse bu başvuruya yanıt yaz.', createdAt: ago(3, 4), reviewedAt: ago(2, 1)
    },
    {
      id: 'app_1005', code: 'MD-2041', type: 'media', nick: 'hasan_165', discord: 'hasan165',
      platform: 'youtube', channel: 'https://www.youtube.com/@Vortexa', followers: 2400,
      contentType: 'shorts', about: 'Minecraft vanilla içerikleri üretiyorum. Son 2 shorts videom toplam 2.4B izlenme aldı. Sunucunuz için haftada 1 shorts + 1 uzun video çekmek istiyorum.',
      status: 'pending', reply: null, createdAt: ago(0, 9), reviewedAt: null
    },
    {
      id: 'app_1006', code: 'MD-2040', type: 'media', nick: 'Moonlight', discord: 'moonlight',
      platform: 'twitch', channel: 'https://www.twitch.tv/moonlight', followers: 850,
      contentType: 'yayin', about: 'Haftada 4 gün 3 saat canlı yayın yapıyorum, ortalama 40 izleyici. Corenya Vanilla tanıtımı ve etkinlik yayını yapabilirim.',
      status: 'pending', reply: null, createdAt: ago(1, 5), reviewedAt: null
    },
    {
      id: 'app_1007', code: 'MD-2035', type: 'media', nick: 'Zeynep', discord: 'zeynep',
      platform: 'tiktok', channel: 'https://www.tiktok.com/@zeynepcraft', followers: 25000,
      contentType: 'shorts', about: 'Minecraft build ve SMP videoları paylaşıyorum. 25K takipçim var, sunucu tanıtımı için seri içerik üretebilirim.',
      status: 'approved', reply: 'Başvurun onaylandı, Discord üzerinden medya rolün verildi. İlk içeriğinde başarılar!', createdAt: ago(6, 2), reviewedAt: ago(4, 3)
    }
  ];
}

function seedOrders() {
  return [
    {
      id: 'ord_5001', code: 'CV-8H2K4L', nick: 'Ayaz', discord: 'ayaz.exe', method: 'papara',
      items: [{ productId: 'vip-gumus', name: 'VIP Gümüş', price: 99.9, qty: 1 }],
      total: 99.9, status: 'pending', createdAt: ago(0, 2)
    },
    {
      id: 'ord_5002', code: 'CV-3M7Q9X', nick: 'LavKral', discord: 'lavkral', method: 'kart',
      items: [
        { productId: 'kasa-efsane-5', name: 'Efsanevi Kasa x5', price: 169.9, qty: 1 },
        { productId: 'kredi-500', name: '500 Corenya Parası', price: 59.9, qty: 1 }
      ],
      total: 229.8, status: 'delivered', createdAt: ago(1, 4)
    },
    {
      id: 'ord_5003', code: 'CV-6T1B8N', nick: 'BetonKar', discord: 'betonkar', method: 'havale',
      items: [{ productId: 'vip-altin', name: 'VIP Altın', price: 179.9, qty: 1 }],
      total: 179.9, status: 'delivered', createdAt: ago(2, 7)
    },
    {
      id: 'ord_5004', code: 'CV-9K4D2F', nick: 'creeperPro', discord: 'creeperpro', method: 'papara',
      items: [{ productId: 'kasa-efsane', name: 'Efsanevi Kasa x1', price: 39.9, qty: 3 }],
      total: 119.7, status: 'paid', createdAt: ago(0, 8)
    },
    {
      id: 'ord_5005', code: 'CV-1P5R7V', nick: 'PvPGod', discord: 'pvpgod', method: 'kart',
      items: [{ productId: 'kredi-1500', name: '1500 Corenya Parası', price: 149.9, qty: 1 }],
      total: 149.9, status: 'cancelled', createdAt: ago(4, 1)
    }
  ];
}

function newDatabase() {
  const { salt, hash } = hashPassword('corenya123');
  return {
    version: 1,
    settings: {
      siteName: 'Corenya Vanilla',
      ip: 'corenyavanilla.com',
      port: 25565,
      version: '1.21.4',
      online: 148,
      maxOnline: 500,
      registered: 1284,
      discord: 'https://discord.gg/corenya',
      storeOpen: true,
      maintenance: false,
      season: 'Sezon 4',
      seasonEnds: '2026-12-20',
      admin: { username: 'admin', salt, hash },
      createdAt: new Date().toISOString()
    },
    players: seedPlayers(),
    products: seedProducts(),
    orders: seedOrders(),
    applications: seedApplications()
  };
}

module.exports = { newDatabase, hashPassword, verifyPassword };
