# Corenya Vanilla — Web Sitesi

`corenyavanilla.com` için hazırlanmış, çalışan bir Minecraft sunucu sitesi.
Pembe / beyaz / mor tema, mağaza, VIP satışı, Baltop, ELO sıralaması, destek &
medya başvuruları ve bunları yöneten **admin paneli** içerir.

> Demo niteliğindedir: ödeme altyapısı ve oyun sunucusu bağlantısı yoktur,
> veriler `data/db.json` dosyasında tutulur. Aşağıdaki "Canlıya alırken"
> bölümüne göz at.

## Çalıştırma

Gereksinim: **Node.js 18+** (başka paket gerekmez).

```powershell
cd corenya-site
node server.js
```

veya `start.bat` dosyasına çift tıkla. Tarayıcıda:

| Sayfa | Adres |
| --- | --- |
| Site | http://localhost:3000 |
| Mağaza | http://localhost:3000/magaza.html |
| Baltop | http://localhost:3000/baltop.html |
| ELO | http://localhost:3000/elo.html |
| Destek | http://localhost:3000/destek.html |
| Medya | http://localhost:3000/medya.html |
| **Admin** | http://localhost:3000/admin.html |

Farklı bir port için: `$env:PORT=8080; node server.js`

### Admin girişi

```
Kullanıcı adı: admin
Şifre:         corenya123
```

İlk girişten sonra **Ayarlar → Şifre değiştir** ile mutlaka değiştir.
Şifre `scrypt` ile hash'lenir; düz metin olarak saklanmaz.

## Neler var?

### Public site
- **Anasayfa** — hero, canlı sunucu kartı, IP kopyalama, öne çıkan ürünler,
  Baltop/ELO ilk 5, SSS.
- **Mağaza** — kategori filtreleri, sepet, adet kontrolü, sipariş oluşturma,
  takip kodu, sipariş sorgulama.
- **Baltop** — ilk 3 podyum, aranabilir tam sıralama, kendi sıranı sorgulama.
- **ELO** — sezon bilgisi, tier seviyeleri, podyum, G/M istatistikleri,
  tier ilerleme çubuğu.
- **Destek** — kategori/öncelik seçimli başvuru formu, başvuru kodu,
  kod ile takip, "başvurularım" listesi.
- **Medya** — platform / takipçi / kanal / içerik türü bilgileriyle başvuru,
  şartlar ve ayrıcalıklar, başvuru takibi.

### Admin paneli
- **Genel Bakış** — bekleyen başvuru/sipariş, ciro, oyuncu sayısı, son hareketler.
- **Başvurular** — tür (destek/medya) ve durum filtreleri, arama, başvuru
  detayı, yanıt yazma, **onaylama / reddetme** (ret için gerekçe zorunlu).
- **Siparişler** — durum filtresi, arama, sipariş durumunu satır içinden
  değiştirme (beklemede / ödendi / teslim edildi / iptal).
- **Oyuncular** — Baltop/ELO verilerini düzenleme, yeni oyuncu ekleme/silme,
  VIP atama.
- **Ürünler** — ürün ekleme/düzenleme/silme, fiyat, eski fiyat, avantajlar,
  etiket, öne çıkarma, aktif/pasif.
- **Ayarlar** — IP, sürüm, online/kayıtlı oyuncu sayısı, Discord linki, sezon,
  mağaza açık/kapalı, bakım modu, şifre değiştirme, JSON yedek indirme/yükleme,
  demo verilerini sıfırlama.

## Klasör yapısı

```
corenya-site/
├── server.js              # HTTP sunucu + REST API + statik dosyalar
├── lib/seed.js            # örnek veriler + şifre hashleme
├── data/db.json           # canlı veritabanı (ilk çalıştırmada üretilir)
├── deploy/windows/        # Windows VDS kurulumu (DEPLOY-WINDOWS.md, .ps1, Caddyfile)
└── public/
    ├── index.html         # anasayfa
    ├── magaza.html        # mağaza
    ├── baltop.html        # baltop
    ├── elo.html           # elo sıralaması
    ├── destek.html        # destek başvurusu
    ├── medya.html         # medya başvurusu
    ├── admin.html         # yönetim paneli
    ├── 404.html
    ├── favicon.svg
    └── assets/
        ├── css/style.css
        └── js/
            ├── api.js     # fetch sarmalayıcı
            ├── ui.js      # header/footer, toast, modal, yardımcılar
            ├── app.js     # public sayfa mantığı
            └── admin.js   # panel mantığı
```

## API (özet)

| Metot | Yol | Açıklama |
| --- | --- | --- |
| GET | `/api/site` | Ayarlar, istatistikler, ilk 5'ler, öne çıkan ürünler |
| GET | `/api/products` | Aktif ürünler |
| GET | `/api/players?sort=balance\|elo` | Oyuncu sıralaması |
| POST | `/api/orders` | Sipariş oluştur |
| GET | `/api/track?code=...` | Sipariş/başvuru takibi |
| POST | `/api/support` · `/api/media` | Başvuru gönder |
| POST | `/api/auth/login` | Admin girişi (Bearer token) |
| GET | `/api/admin/overview` | Panel özeti |
| GET | `/api/admin/applications` | Başvurular (filtreli) |
| POST | `/api/admin/applications/:id/review` | Onay / ret |
| GET | `/api/admin/orders` | Siparişler |
| POST | `/api/admin/orders/:id/status` | Sipariş durumu |
| GET/POST/PUT/DELETE | `/api/admin/players...` | Oyuncu yönetimi |
| GET/POST/PUT/DELETE | `/api/admin/products...` | Ürün yönetimi |
| GET/PUT | `/api/admin/settings` | Site ayarları |
| GET | `/api/admin/export` | JSON yedek |
| POST | `/api/admin/import` · `/api/admin/reset` | Yedek yükle / sıfırla |

Admin uçları `Authorization: Bearer <token>` ister. Giriş denemeleri ve form
gönderimleri IP bazlı hız sınırına tabidir.

## Canlıya alırken

1. **Şifreyi değiştir** (admin panel → Ayarlar).
2. Uygulamayı `127.0.0.1:3000` üzerinde bırak (varsayılan), ters proxy
   (Caddy/Nginx) arkasına al ve HTTPS kullan. Adım adım Windows rehberi:
   [`deploy/windows/DEPLOY-WINDOWS.md`](deploy/windows/DEPLOY-WINDOWS.md)
   (`install-service.ps1` + `install-caddy.ps1`).
3. JSON dosya yerine gerçek bir veritabanına geçmek için `server.js` içindeki
   `db` okuma/yazma katmanını değiştir; API sözleşmesi aynı kalır.
4. Gerçek ödeme için Papara / PayTR / Stripe entegrasyonu ekle; sipariş
   durumunu ödeme webhook'undan `paid` yap.
5. Teslimatı otomatikleştirmek için sunucuya RCON bağlantısı kurup
   `delivered` durumunda komut çalıştır (ör. `lp user <nick> parent add vip`).
6. Discord bildirimi için başvuru/sipariş oluştuğunda webhook çağır.
7. Yönetim panelini IP kısıtı veya ekstra auth katmanı ile koru.

## Not

Bu proje mevcut `corenya-bot` panelinden bağımsızdır; kendi portunda ve kendi
verisiyle çalışır. Başka bir tarayıcıdan yapılan başvurular admin panelinde
görünür (veriler sunucuda saklanır).
