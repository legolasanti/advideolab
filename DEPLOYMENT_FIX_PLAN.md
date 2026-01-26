# AdVideoLab VPS Deployment Fix Plan

## Mevcut Durum Analizi

### Tespit Edilen Sorunlar

1. **Seed Script Çalışmıyor**
   - `.env` dosyasında `ALLOW_PROD_SEED=false` olduğu için
   - Seed script production ortamında çalışmayı reddediyor
   - Bu nedenle veritabanı boş kalıyor

2. **Demo Hesaplar Yok**
   - `SEED_TEST_TENANTS=false` olduğu için
   - Test tenant'ları (Starter Corp, Growth Ltd, Scale Inc) oluşturulmuyor

3. **SystemConfig Tablosu Boş**
   - SMTP, Google OAuth, Stripe ayarları bu tabloda tutuluyor
   - Tablo boş olduğu için Owner panelinde ayarlar görünmüyor
   - Google OAuth Redirect URI boş gözüküyor

4. **CORS Sorunu**
   - `ALLOWED_ORIGINS` sadece `https://app.advideolab.com` içeriyor
   - Ana domain `https://advideolab.com` eksik
   - Bu nedenle ana domain'den login olamıyorsunuz

### Yapılan Analizler

**Google OAuth Redirect URI Nasıl Çalışıyor?**
```typescript
// owner.ts - serializeSystemConfig fonksiyonunda
googleOAuthRedirectUri: `${env.API_PUBLIC_URL}/api/auth/google/callback`
```
Yani: `API_PUBLIC_URL=https://api.advideolab.com` → `https://api.advideolab.com/api/auth/google/callback`

**SystemConfig Nasıl Dolduruluyor?**
- Seed script `.env` dosyasındaki SMTP ve OAuth ayarlarını otomatik olarak SystemConfig'e kopyalar
- Ama seed çalışmazsa tablo boş kalır

**Seed Script Ne Yapıyor?**
1. Plans tablosunu doldurur (Starter, Growth, Scale)
2. Owner hesabı oluşturur (SEED_OWNER_EMAIL/SEED_OWNER_PASSWORD)
3. Test tenant'ları oluşturur (SEED_TEST_TENANTS=true ise)
4. SMTP ayarlarını SystemConfig'e koyar
5. Stripe ve OAuth ayarları için hazırlık yapar

## VPS'de Yapılacak Adımlar

### 1. .env Dosyasını Güncelle

```bash
cd /opt/advideolab

# ALLOWED_ORIGINS'i güncelle (CORS için her iki domain)
sed -i 's|ALLOWED_ORIGINS=https://app.advideolab.com|ALLOWED_ORIGINS=https://app.advideolab.com,https://advideolab.com|g' .env

# Seed'i production ortamında çalıştırmaya izin ver
sed -i 's|ALLOW_PROD_SEED=false|ALLOW_PROD_SEED=true|g' .env

# Test tenant'ları oluşturmayı etkinleştir
sed -i 's|SEED_TEST_TENANTS=false|SEED_TEST_TENANTS=true|g' .env

# Doğrula (çıktı şu şekilde olmalı):
grep "ALLOWED_ORIGINS" .env
# ALLOWED_ORIGINS=https://app.advideolab.com,https://advideolab.com

grep "ALLOW_PROD_SEED" .env
# ALLOW_PROD_SEED=true

grep "SEED_TEST_TENANTS" .env
# SEED_TEST_TENANTS=true
```

### 2. API Container'ını Restart Et

```bash
# API container'ını restart et (yeni .env'yi alması için)
docker compose -f docker-compose.prod.yml restart api

# Restart'ın bitmesini bekle (sağlık kontrolü)
sleep 15

# Container durumunu kontrol et (healthy olmalı)
docker compose -f docker-compose.prod.yml ps
```

### 3. Seed Komutunu Çalıştır

```bash
# Seed script'i çalıştır
docker exec -it advideolab-api-1 npx prisma db seed 2>&1

# Beklenen çıktı şu şekilde olmalı:
# ✅ Super Admin created: abrahamceviz@gmail.com
# 📧 Email: abrahamceviz@gmail.com
# 🔑 Password: (provided via SEED_OWNER_PASSWORD)
# Created Tenant: start@test.com (starter)
# Created Tenant: growth@test.com (growth)
# Created Tenant: scale@test.com (scale)
# 🔑 Tenant admin password (default): Test1234!
# Seed complete
```

### 4. Verileri Kontrol Et

```bash
# Owner hesabı oluştu mu?
docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT email FROM "Owner";' 

# Test tenant'ları oluştu mu?
docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT id, name, status FROM "Tenant";' 

# Planlar oluştu mu?
docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT code, name, "monthlyPriceUsd" FROM "Plan";' 

# SystemConfig doldu mu?
docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT id, "smtpHost", "googleOAuthClientId", "stripePublishableKey" FROM "SystemConfig";' 
```

**Beklenen Çıktılar:**

**Owner:**
```
        email
-------------------------
 abrahamceviz@gmail.com
```

**Tenant:**
```
       id       |    name     | status
----------------+-------------+--------
 tenant-starter | Starter Corp | active
 tenant-growth  | Growth Ltd   | active
 tenant-scale   | Scale Inc    | active
```

**Plan:**
```
  code   |   name   | monthlyPriceUsd
---------+----------+-----------------
 starter | Starter  |              69
 growth  | Growth   |             179
 scale   | Scale    |             499
```

**SystemConfig:**
```
   id    |      smtpHost       | googleOAuthClientId | stripePublishableKey
---------+---------------------+---------------------+----------------------
singleton| smtp-relay.brevo.com| null                | null
```

### 5. SystemConfig'e SMTP Ayarlarını Ekle (Gerekirse)

Eğer seed SMTP ayarlarını eklememişse manuel ekleyin:

```bash
# SMTP şifresini şifrele
ENCRYPTED_PASS=$(docker exec -it advideolab-api-1 node -e "
const crypto = require('crypto');
const key = Buffer.from('1kjSmekqDTOMFg9eHyuWeBqOgPg7Ib+OmoTrYrBNQMg=', 'base64');
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
let enc = cipher.update('vkPRjU3hAVsdHyS', 'utf8', 'hex');
enc += cipher.final('hex');
console.log(iv.toString('hex') + enc);
")

# SystemConfig'i güncelle
docker exec -it advideolab-db-1 psql -U app -d app -c "UPDATE \"SystemConfig\" SET \\
\"smtpHost\"='smtp-relay.brevo.com', \\
\"smtpPort\"=587, \\
\"smtpUser\"='9babe3001@smtp-brevo.com', \\
\"smtpPassEncrypted\"='$ENCRYPTED_PASS', \\
\"emailFrom\"='UGC Studio <ac@abrahamceviz.com>', \\
\"notificationEmail\"='ac@abrahamceviz.com' \\
WHERE id='singleton';"
```

### 6. Tüm Servislerin Durumunu Kontrol Et

```bash
docker compose -f docker-compose.prod.yml ps

# Tüm container'lar "healthy" durumda olmalı
```

## Test Planı

### 1. CORS Testi
- ✅ https://app.advideolab.com/login - login olabilmeli
- ✅ https://advideolab.com/login - login olabilmeli (CORS hatası kalkmalı)

### 2. Owner Paneli Testleri
- Owner Settings sayfasına gir
- **SMTP Settings** bölümü görünmeli
- **Google OAuth** bölümü görünmeli
- **Stripe Settings** bölümü görünmeli
- **Plans** bölümünde Pricing Plans görünmeli

### 3. Google OAuth Ayarları
- Google OAuth Client ID: `[boş bırak]`
- Google OAuth Client Secret: `[boş bırak]`
- Redirect URI: `https://api.advideolab.com/api/auth/google/callback` (OTOMATİK DOLU OLMALI)

### 4. Demo Hesaplar
- Login sayfasında "Demo accounts" gözükmeli
- `start@test.com / Test1234!` ile giriş yapılabilmeli
- `growth@test.com / Test1234!` ile giriş yapılabilmeli
- `scale@test.com / Test1234!` ile giriş yapılabilmeli

### 5. SMTP Testi
- Owner Settings → SMTP Settings → "Send Test Email" butonu
- Email gönderildi mesajı alınmalı
- ac@abrahamceviz.com adresine email gelmeli

### 6. Şifre Sıfırlama Testi
- https://app.advideolab.com/forgot-password sayfasına git
- abrahamceviz@gmail.com adresini gir
- "Password reset email sent" mesajı alınmalı
- Email inbox'ta reset email gelmeli

## Toplu Komutlar (Kopyala-Yapıştır)

```bash
cd /opt/advideolab

# 1. .env dosyasını güncelle
sed -i 's|ALLOWED_ORIGINS=https://app.advideolab.com|ALLOWED_ORIGINS=https://app.advideolab.com,https://advideolab.com|g' .env
sed -i 's|ALLOW_PROD_SEED=false|ALLOW_PROD_SEED=true|g' .env
sed -i 's|SEED_TEST_TENANTS=false|SEED_TEST_TENANTS=true|g' .env

# 2. API container restart
docker compose -f docker-compose.prod.yml restart api

# 3. 15 saniye bekle
sleep 15

# 4. Seed çalıştır
docker exec -it advideolab-api-1 npx prisma db seed 2>&1

# 5. Verileri kontrol et
echo "=== Owner ===" && docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT email FROM "Owner";'
echo "=== Tenants ===" && docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT id, name, status FROM "Tenant";'
echo "=== Plans ===" && docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT code, name FROM "Plan";'
echo "=== SystemConfig ===" && docker exec -it advideolab-db-1 psql -U app -d app -c 'SELECT "smtpHost", "googleOAuthClientId" FROM "SystemConfig";'

# 6. Container durumları
docker compose -f docker-compose.prod.yml ps
```

## Olası Sorunlar ve Çözümleri

### Seed Hata Mesajı: "Refusing to run seed in production"
**Çözüm:** `ALLOW_PROD_SEED=true` yapılmamış. .env dosyasını kontrol et.

### "Invalid credentials" Hatası
**Çözüm:** Seed sonrası şifre `Adm!n2026#Str0ng` olmalı. Eski şifreleri kullanma.

### "Connection refused" veya "database does not exist"
**Çözüm:** Database container'ı hazır değil. `docker compose -f docker-compose.prod.yml logs db` ile kontrol et.

### CORS Hatası: "Origin not allowed"
**Çözüm:** `ALLOWED_ORIGINS` doğru ayarlanmamış. .env dosyasını kontrol et ve API'yi restart et.

## Final Kontrol Listesi

- [ ] .env dosyası güncellendi
- [ ] API container restart edildi
- [ ] Seed komutu çalıştı
- [ ] Owner hesabı oluştu
- [ ] Demo tenant'lar oluştu (Starter Corp, Growth Ltd, Scale Inc)
- [ ] Plans tablosu doldu
- [ ] SystemConfig SMTP ayarlarını aldı
- [ ] https://advideolab.com/login'den giriş yapılabiliyor
- [ ] Owner panelinde SMTP ayarları görünüyor
- [ ] Google OAuth Redirect URI dolu gözüküyor
- [ ] Şifre sıfırlama email'i gönderilebiliyor
- [ ] Tüm container'lar healthy durumda

## Sonuç

Bu adımları takip ederek:
1. ✅ CORS sorunu çözülecek (her iki domain'den de giriş yapılabilecek)
2. ✅ Demo hesaplar oluşacak
3. ✅ SMTP ayarları Owner panelinde görünecek
4. ✅ Google OAuth Redirect URI otomatik dolu olacak
5. ✅ Veritabanı tamamen düzgün çalışacak

**Her komutun çıktısını paylaşın, sorun olursa düzeltelim!**
