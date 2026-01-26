# AdVideoLab VPS Deployment Guide

Bu dokuman, AdVideoLab projesini Hostinger VPS'e deploy etme surecini adim adim aciklar.

## On Kosullar

- **VPS**: Ubuntu 22.04 veya 24.04 (minimum 2GB RAM, 2 CPU)
- **Domain**: advideolab.com (DNS yonetim paneline erisim)
- **IP Adresi**: 89.116.23.115

---

## ADIM 1: DNS Yapilandirmasi

Hostinger DNS panelinde asagidaki A kayitlarini olustur:

| Tip | Host | Deger |
|-----|------|-------|
| A | app | 89.116.23.115 |
| A | api | 89.116.23.115 |
| A | n8n | 89.116.23.115 |
| A | files | 89.116.23.115 |

> **Not**: DNS propagasyonu 5 dakika ile 48 saat arasinda surebilir.

---

## ADIM 2: VPS'e Baglanma

Terminal'den:
```bash
ssh root@89.116.23.115
```

---

## ADIM 3: VPS Kurulumu

VPS'e baglandiktan sonra asagidaki komutlari calistir:

```bash
# Sistemi guncelle
apt update && apt upgrade -y

# Gerekli paketleri kur
apt install -y curl wget git vim htop ufw fail2ban unzip ca-certificates gnupg lsb-release

# Docker'i kur
curl -fsSL https://get.docker.com | sh

# Docker'i baslat
systemctl start docker
systemctl enable docker

# Firewall yapilandir
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Proje dizinini olustur
mkdir -p /opt/advideolab
```

---

## ADIM 4: Projeyi VPS'e Aktar

**Yerel bilgisayarinda** (Mac/Linux):

```bash
# Proje dizinine git
cd /Users/abrahamceviz/Desktop/VSC\ Amazon-resim/Amazon-resim

# rsync ile aktar (hizli ve guvenilir)
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude '.env' \
  ./ root@89.116.23.115:/opt/advideolab/
```

Alternatif olarak scp kullanabilirsin:
```bash
scp -r ./* root@89.116.23.115:/opt/advideolab/
```

---

## ADIM 5: Ortam Degiskenlerini Yapilandir

VPS'te:

```bash
cd /opt/advideolab

# .env dosyasini olustur
cp .env.production.example .env

# Duzenle
vim .env
```

### Onemli Degiskenler

Asagidaki degerleri **mutlaka** degistir:

```bash
# Guvenlik anahtarlari olustur (her biri icin ayri komut calistir)
openssl rand -hex 32    # JWT_SECRET icin
openssl rand -hex 32    # N8N_INTERNAL_TOKEN icin
openssl rand -hex 32    # COMPOSE_INTERNAL_TOKEN icin
openssl rand -base64 32 # ENCRYPTION_KEY icin
```

```env
# Bu degerleri guncelle:
JWT_SECRET=<yukaridaki komuttan>
ENCRYPTION_KEY=<yukaridaki komuttan>
N8N_INTERNAL_TOKEN=<yukaridaki komuttan>

# Sifreler (guclu ve benzersiz)
POSTGRES_PASSWORD=<guclu-sifre>
MINIO_ROOT_PASSWORD=<guclu-sifre>
SEED_OWNER_PASSWORD=<admin-sifresi>
N8N_BASIC_AUTH_PASSWORD=<n8n-sifresi>

# Admin bilgileri
SEED_OWNER_EMAIL=senin@email.com

# IP adresini gir (n8n erisimi icin)
N8N_ALLOWED_IPS=<senin-ev-IP-adresin>
```

> **IP Adresini Bul**: https://whatismyipaddress.com/ adresinden ogrenebilirsin

---

## ADIM 6: Deployment

```bash
cd /opt/advideolab

# Script'lere calistirma izni ver
chmod +x scripts/*.sh

# Fresh deployment (ilk kurulum)
./scripts/deploy.sh --fresh
```

Bu komut:
1. Docker image'larini olusturur
2. Tum servisleri baslatir
3. Database migration'larini calistirir
4. Database'i seed eder (admin kullanici olusturur)
5. Saglik kontrolu yapar

---

## ADIM 7: Dogrulama

```bash
# Servislerin durumunu kontrol et
docker compose -f docker-compose.prod.yml ps

# Loglari izle
docker compose -f docker-compose.prod.yml logs -f

# Saglik kontrolu
./scripts/verify-prod-health.sh
```

Tarayicidan kontrol et:
- https://app.advideolab.com (Ana uygulama)
- https://api.advideolab.com/healthz (API saglik)
- https://n8n.advideolab.com (N8N - IP kisitlamasi var)

---

## Sorun Giderme

### SSL Sertifikasi Sorunu
Caddy otomatik SSL alir. Sorun varsa:
```bash
docker compose -f docker-compose.prod.yml logs caddy
```

### Database Baglanti Hatasi
```bash
docker compose -f docker-compose.prod.yml logs db
docker compose -f docker-compose.prod.yml exec db pg_isready -U app
```

### API Hatasi
```bash
docker compose -f docker-compose.prod.yml logs api
```

### Servisi Yeniden Baslat
```bash
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart web
```

---

## Bakim Islemleri

### Gunluk Backup (Otomatik)
Backup'lar `/var/backups/advideolab/postgres/` dizininde saklanir.

Manuel backup:
```bash
./scripts/backup-postgres.sh
```

### Guncelleme
```bash
cd /opt/advideolab
git pull origin main  # veya rsync ile yeni dosyalari aktar
./scripts/deploy.sh
```

### Loglari Temizle
```bash
docker system prune -f
```

---

## Guvenlik Onerileri

1. **SSH Sifresini Degistir**: VPS'e girdikten hemen sonra
   ```bash
   passwd root
   ```

2. **SSH Key Authentication**: Sifre yerine SSH key kullan
   ```bash
   # Yerel bilgisayarda
   ssh-copy-id root@89.116.23.115
   ```

3. **Root Yerine Normal Kullanici**:
   ```bash
   adduser advideolab
   usermod -aG docker advideolab
   ```

4. **Fail2ban Aktif**: SSH brute-force koruması otomatik

5. **Firewall Aktif**: Sadece 22, 80, 443 portlari acik

---

## Iletisim & Destek

Sorun yasarsan:
1. Loglari kontrol et: `docker compose -f docker-compose.prod.yml logs`
2. Saglik kontrolu: `./scripts/verify-prod-health.sh`
3. DNS propagasyonunu bekle (yeni domain icin)
