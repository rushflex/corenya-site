# Windows VDS'e Kurulum (Corenya Vanilla)

Bu rehber, siteyi **Windows Server** bir VDS'e kurmak için baştan sona adımları içerir.
Toplam süre ~15 dakika. Gereken tek şey: Node.js + NSSM + Caddy (hepsi ücretsiz).

> Not: Site `127.0.0.1:3000` üzerinde çalışır. Dışarıya **sadece 80/443** açılır.
> 3000 portu internete açılmaz — admin paneli şifresiz HTTP üzerinden görünmesin diye.

---

## 1. Node.js kur

1. https://nodejs.org → **LTS (20.x veya üzeri)** Windows Installer (.msi) indir.
2. Kurulumda "Add to PATH" seçeneğini açık bırak.
3. Doğrula (yeni PowerShell):

```powershell
node -v
```

`v20.x` benzeri bir çıktı görmelisin.

---

## 2. Dosyaları VDS'e kopyala

Proje klasörünü `C:\corenya` altına koy (RDP üzerinden kopyala-yapıştır, ya da yerel makineden):

```powershell
scp -r corenya-site root@VDS_IP:C:/corenya
```

veya zip'leyip RDP ile taşı:

```powershell
Compress-Archive -Path corenya-site\* -DestinationPath corenya-site.zip
```

**Kopyalama sonrası** `C:\corenya\data\db.json` dosyasını **sil** (varsa). Sunucu ilk açılışta
temiz demo verisini kendisi oluşturur; böylece yereldeki test kayıtları canlıya taşınmaz.

Klasör yapısı şöyle olmalı:

```
C:\corenya\
  server.js
  package.json
  public\
  lib\
  deploy\windows\
  data\        <- otomatik oluşur
```

---

## 3. Elle test et

```powershell
cd C:\corenya
node server.js
```

Tarayıcıda `http://127.0.0.1:3000` aç. Çalışıyorsa `Ctrl+C` ile durdur ve servise geç.

---

## 4. Servis olarak kur (otomatik başlangıç)

PowerShell'i **yönetici olarak** aç:

```powershell
cd C:\corenya\deploy\windows
powershell -ExecutionPolicy Bypass -File .\install-service.ps1
```

Script şunları yapar:

- NSSM'i indirir (`C:\corenya\tools\nssm.exe`)
- `CorenyaSite` servisini kurar, otomatik başlangıç + hata durumunda yeniden başlatma
- Logları `C:\corenya\logs\` altına yazar (1 MB'ta döndürür)
- Windows Güvenlik Duvarı'nda 80 ve 443'ü açar
- API sağlık kontrolü yapar

Kontrol:

```powershell
Get-Service CorenyaSite
Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing
```

Farklı klasör/port için:

```powershell
.\install-service.ps1 -AppDir "D:\corenya" -Port 3000
```

---

## 5. DNS

Alan adı panelinde:

| Tür | Ad | Değer |
|---|---|---|
| A | `@` | VDS IP |
| A | `www` | VDS IP |

Yayılması birkaç dakika sürebilir. Kontrol:

```powershell
Resolve-DnsName corenyavanilla.com
```

Çıkan IP, VDS'in IP'si olmalı. **Bu adım tamamlanmadan HTTPS alınamaz.**

Ayrıca sağlayıcının (VDS paneli) güvenlik duvarında 80 ve 443 açık olmalı.

---

## 6. HTTPS (Caddy)

```powershell
cd C:\corenya\deploy\windows
powershell -ExecutionPolicy Bypass -File .\install-caddy.ps1 -Domain corenyavanilla.com
```

Script:

- Caddy'yi indirir (`C:\corenya\tools\caddy.exe`)
- `Caddyfile`'ı alan adına göre yazar
- Yapılandırmayı doğrular (`caddy validate`)
- `CorenyaCaddy` servisini kurar (80/443 → `127.0.0.1:3000`)
- Let's Encrypt sertifikasını alır ve otomatik yeniler
- Sertifikaları `C:\corenya\caddy-data` altında tutar (yedeklenebilir)

Sonuç: **https://corenyavanilla.com**

---

## 7. Yayına aldıktan sonra (zorunlu)

1. **Admin şifresini değiştir** → `https://corenyavanilla.com/admin.html` → `admin / corenya123` ile gir → Ayarlar → şifre değiştir.
2. **Yedek görevi** kur (Task Scheduler veya tek satırlık zamanlanmış görev):

```powershell
schtasks /Create /TN "CorenyaDBBackup" /SC DAILY /ST 04:00 /RU SYSTEM /TR "powershell -NoProfile -Command \"Copy-Item 'C:\corenya\data\db.json' ('C:\corenya\backups\db-' + (Get-Date -Format yyyy-MM-dd) + '.json')\""
```

3. Şunları tek tek dene: anasayfa, mağaza siparişi, destek formu, sipariş takibi, admin girişi.
4. `data\db.json` tek dosyada tüm veriyi tutar — yedeği bu dosyadır.

---

## 8. Güncelleme (kod değişince)

```powershell
# dosyaları kopyaladıktan sonra
Restart-Service CorenyaSite
```

`data\` klasörüne dokunma; veriler orada kalır.

---

## 9. Sık karşılaşılan sorunlar

| Belirti | Çözüm |
|---|---|
| `node` tanınmıyor | Node kurulduktan sonra PowerShell'i kapat-aç, PATH yenilenir |
| Servis başlamıyor | `C:\corenya\logs\site-error.log` oku; genelde `EADDRINUSE` (port dolu) |
| `EADDRINUSE :3000` | `Get-NetTCPConnection -LocalPort 3000` → süreci bul, durdur |
| HTTPS sertifikası alınmıyor | DNS VDS IP'sini göstermiyor veya 80/443 kapalı; `logs\caddy.log` |
| Caddy başlamıyor | IIS/http.sys 80'i tutuyor: `Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled` |
| Dışarıdan 502/bağlantı yok | `Get-Service CorenyaSite` + sağlayıcı panelindeki güvenlik duvarı |
| Import'ta 413 | Caddy varsayılan olarak limit koymaz; IIS kullanıyorsan `maxAllowedContentLength` artır |
| Yerel çalışıyor, alan adından açılmıyor | DNS + 80/443 + `Get-Service CorenyaCaddy` üçlüsünü kontrol et |

---

## 10. (Alternatif) Nginx yerine Caddy kullanmıyor musun?

`deploy/windows/` altındaki dosyalar Caddy için hazır. Nginx tercih edersen
`nginx.conf` örneğini Linux rehberindeki blokla aynı şekilde kullanabilirsin;
ancak Windows'ta nginx + sertifika yönetimi (win-acme) daha zahmetlidir.
