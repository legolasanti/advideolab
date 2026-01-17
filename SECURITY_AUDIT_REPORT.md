# Kapsamlı Güvenlik Denetim Raporu

**Tarih:** 2026-01-17
**Proje:** Amazon-Resim UGC Video SaaS
**Denetçi:** Claude Security Analysis
**Versiyon:** 2.0 (Birleştirilmiş Rapor)

---

## Yönetici Özeti

Bu rapor, backend API'nin kapsamlı güvenlik denetimini içermektedir. Toplam **28 güvenlik açığı** tespit edilmiştir:

| Seviye | Sayı | Açıklama |
|--------|------|----------|
| **KRİTİK** | 6 | Hemen müdahale gerektirir |
| **YÜKSEK** | 14 | 1 hafta içinde düzeltilmeli |
| **ORTA** | 6 | 2 hafta içinde düzeltilmeli |
| **DÜŞÜK** | 2 | Planlı bakımda düzeltilmeli |

---

## Düzeltme Öncelik Sıralaması

### FAZA 1: KRİTİK (0-24 Saat)

| # | CVE ID | Açık | Dosya | Risk |
|---|--------|------|-------|------|
| 1 | SEC-001 | Video Callback Auth Yok | routes/videos.ts:203 | Kota bypass, job manipülasyonu |
| 2 | SEC-002 | UGC Callback Timing Attack | routes/ugc.ts:176 | Token brute-force |
| 3 | SEC-003 | IDOR - Tenant İzolasyonu | middleware/auth.ts:22 | Veri sızıntısı |
| 4 | SEC-004 | Race Condition - Kota | services/quota.ts:133 | Sınırsız kullanım |
| 5 | SEC-005 | S3 Path Traversal | lib/s3.ts:33 | Dosya sistemi erişimi |
| 6 | SEC-006 | Job Callback Tenant Doğrulama Yok | routes/videos.ts:203 | Cross-tenant saldırı |

### FAZA 2: YÜKSEK (24 Saat - 1 Hafta)

| # | CVE ID | Açık | Dosya | Risk |
|---|--------|------|-------|------|
| 7 | SEC-007 | Negatif Video Sayısı | services/quota.ts:147 | Kota manipülasyonu |
| 8 | SEC-008 | Stripe Webhook Replay | routes/stripeWebhook.ts:7 | Çift faturalama |
| 9 | SEC-009 | CORS Wildcard | app.ts:18 | CSRF saldırıları |
| 10 | SEC-010 | JWT 12 Saat Expiration | utils/jwt.ts:14 | Uzun saldırı penceresi |
| 11 | SEC-011 | Coupon Sınırsız Kullanım | services/stripe.ts:217 | Gelir kaybı |
| 12 | SEC-012 | 200MB Upload Memory DoS | routes/ugc.ts:34 | Servis kesintisi |
| 13 | SEC-013 | AES Key Derivation Yok | lib/crypto.ts:4 | Zayıf şifreleme |
| 14 | SEC-014 | Error Info Leak | middleware/errorHandler.ts:13 | Sistem bilgi sızıntısı |
| 15 | SEC-015 | S3 Public ACL | lib/s3.ts:25 | Veri ifşası |
| 16 | SEC-016 | Impersonation Audit Yok | routes/owner.ts:196 | İz bırakmayan erişim |
| 17 | SEC-017 | SSRF imageUrl | routes/ugc.ts:14 | Internal servis erişimi |
| 18 | SEC-018 | Unbounded Query DoS | routes/videos.ts:148 | Veritabanı DoS |
| 19 | SEC-019 | CSRF Koruması Yok | app.ts (global) | State değişiklik saldırıları |
| 20 | SEC-020 | File MIME Validation Yok | routes/admin.ts:48 | Zararlı dosya yükleme |

### FAZA 3: ORTA (1-2 Hafta)

| # | CVE ID | Açık | Dosya | Risk |
|---|--------|------|-------|------|
| 21 | SEC-021 | Job State Machine İhlali | routes/videos.ts:203 | Replay attack |
| 22 | SEC-022 | Email Header Injection | services/email.tsx:90 | Email hijack |
| 23 | SEC-023 | Timing - Email Enumeration | routes/auth.ts:236 | Kullanıcı keşfi |
| 24 | SEC-024 | Cascade Delete Yok | schema.prisma | Orphan kayıtlar |
| 25 | SEC-025 | Blog XSS | routes/owner.ts:271 | Script injection |
| 26 | SEC-026 | Son Admin Silme Koruması Yok | routes/admin.ts:120 | Hesap kilitleme |

### FAZA 4: DÜŞÜK (Planlı Bakım)

| # | CVE ID | Açık | Dosya | Risk |
|---|--------|------|-------|------|
| 27 | SEC-027 | Bcrypt 10 Rounds | services/password.ts:3 | Brute-force kolaylığı |
| 28 | SEC-028 | Hardcoded Owner Email | config/env.ts:57 | Konfigürasyon hatası |

---

## Detaylı Açık Analizleri

---

## SEC-001: Video Callback Endpoint'inde Authentication Yok
**Seviye:** KRİTİK
**CVSS:** 9.8
**Dosya:** `apps/api/src/routes/videos.ts:203-237`

### Mevcut Kod
```typescript
router.post('/jobs/:id/callback', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  // HİÇBİR AUTH KONTROLÜ YOK!
  const parsed = callbackSchema.safeParse(req.body);
  // ...
  await incrementUsageOnSuccess(job.tenantId, completedCount);
});
```

### Saldırı Senaryosu
1. Saldırgan rastgele job ID'leri dener (UUID tahmin edilebilir)
2. Geçerli bir job bulunduğunda callback çağrılır
3. `status: 'done'` ile job tamamlanmış gibi gösterilir
4. Veya `status: 'error'` ile başka tenant'ın job'u bozulur
5. Kota manipülasyonu yapılabilir

### Düzeltme
```typescript
import { verifyWebhookSignature } from '../lib/signature';

router.post('/jobs/:id/callback', async (req, res) => {
  // 1. Signature doğrulama
  const signature = req.header('x-webhook-signature');
  const timestamp = parseInt(req.header('x-webhook-timestamp') || '0', 10);

  if (!signature || !verifyWebhookSignature(req.body, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // 2. Job durumu kontrolü (state machine)
  if (!['pending', 'running', 'processing'].includes(job.status)) {
    return res.status(409).json({ error: 'Job already finalized' });
  }

  // ... devam
});
```

---

## SEC-002: UGC Callback Token Timing Attack
**Seviye:** KRİTİK
**CVSS:** 9.1
**Dosya:** `apps/api/src/routes/ugc.ts:176-179`

### Mevcut Kod
```typescript
const token = req.header('x-internal-api-token');
if (!token || token !== env.n8nInternalToken) {  // TIMING ATTACK!
  return res.status(401).json({ error: 'unauthorized' });
}
```

### Saldırı Senaryosu
1. `!==` operatörü string karşılaştırmada timing leak yaratır
2. Doğru karakterde eşleşme olduğunda microsaniye fark oluşur
3. Saldırgan binlerce istek göndererek token'ı karakter karakter tahmin eder
4. ~32 karakter token için ~32*256 = 8192 istek yeterli
5. Token ele geçirilince herhangi bir job'a video yüklenebilir

### Düzeltme
```typescript
import crypto from 'crypto';

const token = req.header('x-internal-api-token');
if (!token) {
  return res.status(401).json({ error: 'unauthorized' });
}

// Constant-time comparison
const tokenBuffer = Buffer.from(token);
const expectedBuffer = Buffer.from(env.n8nInternalToken);

// Uzunluk farkı da timing leak yaratır, önce padding yap
const maxLen = Math.max(tokenBuffer.length, expectedBuffer.length);
const paddedToken = Buffer.alloc(maxLen);
const paddedExpected = Buffer.alloc(maxLen);
tokenBuffer.copy(paddedToken);
expectedBuffer.copy(paddedExpected);

if (!crypto.timingSafeEqual(paddedToken, paddedExpected)) {
  return res.status(401).json({ error: 'unauthorized' });
}
```

---

## SEC-003: IDOR - Tenant İzolasyonu Eksik
**Seviye:** KRİTİK
**CVSS:** 8.6
**Dosya:** `apps/api/src/middleware/auth.ts:17-27`

### Mevcut Kod
```typescript
const effectiveRole = claims.role === 'owner_superadmin' && claims.actingRole
  ? claims.actingRole
  : claims.role;

req.auth = {
  role: effectiveRole,
  tenantId: claims.tenantId ?? claims.impersonatedTenantId,  // JWT'ye güveniyor!
  userId: claims.role === 'owner_superadmin' && claims.actingRole ? undefined : claims.sub,
  // ...
};
```

### Saldırı Senaryosu
1. Kullanıcı A, Tenant X'e ait (JWT: `tenantId: X`)
2. JWT decode edilip `tenantId: Y` olarak değiştirilirse
3. `verifyToken` sadece signature kontrol ediyor, tenant-user ilişkisi yok
4. Kullanıcı A artık Tenant Y'nin tüm verilerine erişebilir

### Düzeltme
```typescript
// apps/api/src/middleware/validateTenantClaim.ts
export const validateTenantClaim = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Owner impersonation - izin ver
  if (req.auth?.originalRole === 'owner_superadmin') {
    return next();
  }

  // Normal kullanıcı - tenant doğrula
  if (req.auth?.userId && req.auth?.tenantId) {
    const user = await prisma.user.findFirst({
      where: {
        id: req.auth.userId,
        tenantId: req.auth.tenantId
      },
      select: { id: true }
    });

    if (!user) {
      return res.status(403).json({ error: 'Tenant access denied' });
    }
  }

  next();
};

// Route'lara ekle
router.get('/jobs/:id', requireAuth, validateTenantClaim, requireTenantRole([...]), ...)
```

---

## SEC-004: Race Condition - Atomik Olmayan Kota Kontrolü
**Seviye:** KRİTİK
**CVSS:** 8.1
**Dosya:** `apps/api/src/services/quota.ts:133-150`

### Mevcut Kod
```typescript
// KONTROL (videos.ts:88)
const tenant = await ensureTenantReadyForUsage(req.auth.tenantId, videoCount);

// ... job oluşturulur, n8n'e gönderilir ...

// GÜNCELLEME (videos.ts:235) - ÇOK SONRA!
await incrementUsageOnSuccess(job.tenantId, completedCount);
```

### Saldırı Senaryosu
```
Tenant kotası: 10 video, kullanılan: 9

T=0ms: İstek A gelir, kontrol: 9+1 <= 10 ✓
T=1ms: İstek B gelir, kontrol: 9+1 <= 10 ✓  (henüz güncellenmedi!)
T=2ms: İstek C gelir, kontrol: 9+1 <= 10 ✓
T=100ms: Job A tamamlanır, kota: 10
T=101ms: Job B tamamlanır, kota: 11 (AŞIM!)
T=102ms: Job C tamamlanır, kota: 12 (AŞIM!)
```

### Düzeltme
```typescript
// apps/api/src/services/quota.ts
export const atomicQuotaReservation = async (
  tenantId: string,
  requestedVideos: number
): Promise<void> => {
  // Serializable isolation ile transaction
  await prisma.$transaction(async (tx) => {
    // Lock the row
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: {
        videosUsedThisCycle: true,
        monthlyVideoLimit: true,
        bonusCredits: true,
        status: true,
        paymentStatus: true,
        planDetails: { select: { monthlyVideoLimit: true } }
      }
    });

    if (!tenant) throw new Error('Tenant not found');
    if (tenant.status !== 'active') throw new Error('Tenant not active');
    if (tenant.paymentStatus === 'past_due') throw new Error('Payment past due');

    const limit = tenant.monthlyVideoLimit ??
                  tenant.planDetails?.monthlyVideoLimit ?? 0;
    const available = limit + (tenant.bonusCredits ?? 0) - tenant.videosUsedThisCycle;

    if (requestedVideos > available) {
      throw new QuotaExceededError(`Quota exceeded: ${available} remaining`);
    }

    // Atomik increment - aynı transaction içinde
    await tx.tenant.update({
      where: { id: tenantId },
      data: { videosUsedThisCycle: { increment: requestedVideos } }
    });
  }, {
    isolationLevel: 'Serializable',
    timeout: 10000
  });
};
```

---

## SEC-005: S3 Path Traversal
**Seviye:** KRİTİK
**CVSS:** 7.5
**Dosya:** `apps/api/src/lib/s3.ts:33-36`

### Mevcut Kod
```typescript
export const generateAssetKey = (
  tenantId: string,
  type: 'input' | 'output',
  jobId: string,
  ext: string  // KULLANICI GİRİŞİ!
) => {
  const random = crypto.randomBytes(4).toString('hex');
  return `${tenantId}/${type}/${jobId}-${random}.${ext}`;
};
```

### Saldırı Senaryosu
1. `ext = "../../../private/secrets"` gönderilir
2. Key: `tenant123/input/job456-abc123./../../../private/secrets`
3. S3 path normalization'a bağlı olarak farklı bucket'lara yazılabilir
4. Başka tenant'ın dosyalarının üzerine yazılabilir

### Düzeltme
```typescript
const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',  // Görseller
  'mp4', 'webm', 'mov', 'avi'           // Videolar
]);

const sanitizeExtension = (ext: string): string => {
  // Sadece alfanumerik
  const cleaned = ext.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!ALLOWED_EXTENSIONS.has(cleaned)) {
    throw new Error(`Invalid extension: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
  }

  return cleaned;
};

const sanitizePathComponent = (component: string): string => {
  // Path traversal karakterlerini temizle
  const cleaned = component.replace(/[^a-zA-Z0-9-_]/g, '');

  if (cleaned.includes('..') || cleaned.startsWith('.')) {
    throw new Error('Invalid path component');
  }

  return cleaned;
};

export const generateAssetKey = (
  tenantId: string,
  type: 'input' | 'output',
  jobId: string,
  ext: string
): string => {
  const safeTenantId = sanitizePathComponent(tenantId);
  const safeJobId = sanitizePathComponent(jobId);
  const safeExt = sanitizeExtension(ext);
  const random = crypto.randomBytes(4).toString('hex');

  return `${safeTenantId}/${type}/${safeJobId}-${random}.${safeExt}`;
};
```

---

## SEC-006: Job Callback Tenant Doğrulama Yok
**Seviye:** KRİTİK
**CVSS:** 7.5
**Dosya:** `apps/api/src/routes/videos.ts:203-207`

### Mevcut Kod
```typescript
router.post('/jobs/:id/callback', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  // Job bulundu ama hangi tenant'tan geldiği doğrulanmıyor
  // Saldırgan başka tenant'ın job'unu manipüle edebilir
```

### Düzeltme
SEC-001 ile birlikte düzeltilecek. Ek olarak:
```typescript
// Job'un callback URL'i şifrelenmiş tenant bilgisi içermeli
const callbackUrl = `${env.API_PUBLIC_URL}/api/videos/jobs/${job.id}/callback?t=${encryptedTenantToken}`;

// Callback'te doğrula
const tenantToken = decrypt(req.query.t);
if (tenantToken !== job.tenantId) {
  return res.status(403).json({ error: 'Tenant mismatch' });
}
```

---

## SEC-007: Negatif Video Sayısı Exploit
**Seviye:** YÜKSEK
**CVSS:** 7.2
**Dosya:** `apps/api/src/services/quota.ts:147`

### Mevcut Kod
```typescript
await prisma.tenant.update({
  where: { id: tenantId },
  data: {
    videosUsedThisCycle: { increment: incrementBy },  // incrementBy negatif olabilir!
  },
});
```

### Saldırı Senaryosu
1. API'ye `video_count: -5` gönderilir
2. `clampNumber` fonksiyonu minimum 1 yapıyor AMA
3. Callback'te `completedCount` hesaplanırken farklı bir değer kullanılabilir
4. Veya direkt DB manipülasyonu ile negatif değer enjekte edilir

### Düzeltme
```typescript
export const incrementUsageOnSuccess = async (
  tenantId: string,
  incrementBy: number
): Promise<void> => {
  // Strict validation
  if (!Number.isInteger(incrementBy) || incrementBy <= 0) {
    throw new Error(`Invalid increment value: ${incrementBy}. Must be positive integer.`);
  }

  if (incrementBy > 100) {
    throw new Error(`Increment too large: ${incrementBy}. Max: 100`);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      videosUsedThisCycle: { increment: incrementBy },
    },
  });
};
```

---

## SEC-008: Stripe Webhook Replay Attack
**Seviye:** YÜKSEK
**CVSS:** 7.1
**Dosya:** `apps/api/src/routes/stripeWebhook.ts:7-22`

### Mevcut Kod
```typescript
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  await processStripeWebhook(req.body as Buffer, signature);
  return res.json({ received: true });
  // İDEMPOTENCY KONTROLÜ YOK!
});
```

### Saldırı Senaryosu
1. `invoice.payment_succeeded` webhook'u gelir, işlenir
2. Network timeout olur, Stripe tekrar gönderir
3. Aynı event 2 kez işlenir
4. Billing cycle sıfırlanır, kota resetlenir
5. Veya kupon 2 kez uygulanır

### Düzeltme
```prisma
// schema.prisma
model ProcessedWebhook {
  id          String   @id @default(cuid())
  provider    String   // 'stripe'
  eventId     String   // Stripe event ID
  eventType   String   // 'invoice.payment_succeeded'
  processedAt DateTime @default(now())

  @@unique([provider, eventId])
  @@index([processedAt])
}
```

```typescript
// services/stripe.ts
export const processStripeWebhook = async (rawBody: Buffer, signatureHeader: string) => {
  const { stripe, webhookSecret } = await getStripeSecrets();
  const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);

  // Idempotency check
  const existing = await prisma.processedWebhook.findUnique({
    where: { provider_eventId: { provider: 'stripe', eventId: event.id } }
  });

  if (existing) {
    console.log(`[stripe] Webhook already processed: ${event.id}`);
    return; // Silently ignore duplicate
  }

  // Process event...

  // Mark as processed
  await prisma.processedWebhook.create({
    data: {
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type
    }
  });
};
```

---

## SEC-009: CORS Wildcard
**Seviye:** YÜKSEK
**CVSS:** 6.8
**Dosya:** `apps/api/src/app.ts:16-21`

### Mevcut Kod
```typescript
app.use(cors({
  origin: true,  // TÜM ORİGİN'LERE İZİN!
  credentials: true,
}));
```

### Düzeltme
```typescript
// apps/api/src/config/env.ts
allowedOrigins: z.string()
  .optional()
  .transform(val => val ? val.split(',').map(s => s.trim()) : []),

// apps/api/src/app.ts
const ALLOWED_ORIGINS = env.allowedOrigins.length > 0
  ? env.allowedOrigins
  : ['http://localhost:4173', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Preflight veya same-origin
    if (!origin) return callback(null, true);

    // Development mode - izin ver
    if (env.isDev) return callback(null, true);

    // Whitelist kontrolü
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('CORS policy violation'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

---

## SEC-010: JWT 12 Saat Expiration
**Seviye:** YÜKSEK
**CVSS:** 6.5
**Dosya:** `apps/api/src/utils/jwt.ts:14`

### Mevcut Kod
```typescript
export const signToken = (payload: AuthClaims) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
};
```

### Düzeltme
```typescript
// Access token - kısa ömürlü
export const signAccessToken = (payload: AuthClaims) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' });
};

// Refresh token - uzun ömürlü, sadece yenileme için
export const signRefreshToken = (userId: string) => {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// routes/auth.ts - Refresh endpoint
router.post('/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);

  try {
    const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as { sub: string; type: string };

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newAccessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId
    });

    res.json({ token: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

---

## SEC-011: Coupon Sınırsız Kullanım
**Seviye:** YÜKSEK
**CVSS:** 6.5
**Dosya:** `apps/api/src/services/stripe.ts:217-250`

### Mevcut Kod
```prisma
model Coupon {
  usedCount Int @default(0)  // Artırılıyor ama kontrol YOK
  // maxUses YOK
  // maxPerTenant YOK
}
```

### Düzeltme
```prisma
model Coupon {
  id             String    @id @default(cuid())
  code           String    @unique
  type           String    // 'percent' | 'fixed'
  value          Int
  expiresAt      DateTime?
  isActive       Boolean   @default(true)
  maxUses        Int?      // null = unlimited
  maxPerTenant   Int       @default(1)
  usedCount      Int       @default(0)
  stripeCouponId String?   @unique
  createdAt      DateTime  @default(now())

  // Kullanım takibi
  usages         CouponUsage[]
}

model CouponUsage {
  id        String   @id @default(cuid())
  couponId  String
  tenantId  String
  usedAt    DateTime @default(now())

  coupon    Coupon   @relation(fields: [couponId], references: [id])
  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([couponId, tenantId])  // Aynı tenant aynı kuponu 1 kez kullanabilir
}
```

```typescript
export const validateAndApplyCoupon = async (
  couponCode: string,
  tenantId: string
): Promise<Coupon> => {
  const coupon = await prisma.coupon.findUnique({
    where: { code: couponCode.toUpperCase() },
    include: { usages: { where: { tenantId } } }
  });

  if (!coupon || !coupon.isActive) {
    throw new HttpError(400, 'Invalid coupon code');
  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new HttpError(400, 'Coupon expired');
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    throw new HttpError(400, 'Coupon usage limit reached');
  }

  if (coupon.usages.length >= coupon.maxPerTenant) {
    throw new HttpError(400, 'You have already used this coupon');
  }

  // Kullanımı kaydet
  await prisma.$transaction([
    prisma.couponUsage.create({
      data: { couponId: coupon.id, tenantId }
    }),
    prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } }
    })
  ]);

  return coupon;
};
```

---

## SEC-012: 200MB Upload Memory DoS
**Seviye:** YÜKSEK
**CVSS:** 6.5
**Dosya:** `apps/api/src/routes/ugc.ts:34-39`

### Mevcut Kod
```typescript
const largeUpload = multer({
  storage: multer.memoryStorage(),  // RAM'de!
  limits: { fileSize: 200 * 1024 * 1024 },
});
```

### Düzeltme
```typescript
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Disk storage with streaming
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(os.tmpdir(), 'ugc-uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const largeUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,  // 200MB -> 100MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Rate limiting
const uploadRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,  // Dakikada 5 upload
  keyGenerator: (req) => req.auth?.tenantId || req.ip,
  message: { error: 'Upload rate limit exceeded' }
});

router.post('/uploads/hero', uploadRateLimiter, largeUpload.single('image'), ...)
```

---

## SEC-013: AES Key Derivation Yok
**Seviye:** YÜKSEK
**CVSS:** 6.2
**Dosya:** `apps/api/src/lib/crypto.ts:4`

### Mevcut Kod
```typescript
const key = Buffer.from(env.ENCRYPTION_KEY, 'utf-8');  // YANLIŞ!
```

### Düzeltme
```typescript
import crypto from 'crypto';
import { env } from '../config/env';

// Key derivation with scrypt (memory-hard, brute-force resistant)
const SALT = 'amazon-resim-aes-key-derivation-v1';
const KEY_LENGTH = 32; // AES-256

let derivedKey: Buffer | null = null;

const getKey = (): Buffer => {
  if (!derivedKey) {
    derivedKey = crypto.scryptSync(
      env.ENCRYPTION_KEY,
      SALT,
      KEY_LENGTH,
      { N: 16384, r: 8, p: 1 }  // scrypt parameters
    );
  }
  return derivedKey;
};

export const encrypt = (plain: string): string => {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decrypt = (encoded: string): string => {
  const key = getKey();
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
};
```

---

## SEC-014: Error Information Leak
**Seviye:** YÜKSEK
**CVSS:** 5.3
**Dosya:** `apps/api/src/middleware/errorHandler.ts:13-22`

### Mevcut Kod
```typescript
if (err instanceof ZodError) {
  return res.status(400).json({ error: err.flatten() });  // Validasyon detayları
}
if (err instanceof HttpError) {
  return res.status(err.status).json({ error: err.message });  // Ham hata mesajı
}
```

### Düzeltme
```typescript
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Request ID for correlation
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  // Internal logging (detailed)
  console.error({
    requestId,
    error: err.name,
    message: err.message,
    stack: env.isDev ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.auth?.userId,
    tenantId: req.auth?.tenantId,
  });

  // Client response (minimal)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      requestId,
      // Production'da detay verme
      ...(env.isDev && { details: err.flatten() })
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: env.isDev ? err.message : 'Request failed',
      requestId
    });
  }

  // Generic error - hiçbir detay verme
  return res.status(500).json({
    error: 'Internal server error',
    requestId
  });
};
```

---

## SEC-015: S3 Public ACL
**Seviye:** YÜKSEK
**CVSS:** 5.3
**Dosya:** `apps/api/src/lib/s3.ts:25`

### Mevcut Kod
```typescript
ACL: 'public-read',  // Herkes okuyabilir!
```

### Düzeltme
```typescript
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Upload - private ACL
export const uploadBuffer = async (
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> => {
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      // ACL yok = private (default)
      ContentType: contentType,
    })
  );

  // CDN URL yerine signed URL döndür
  return await getSignedAssetUrl(key, 7200); // 2 saat
};

// Signed URL generator
export const getSignedAssetUrl = async (
  key: string,
  expiresIn: number = 3600
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
};
```

---

## SEC-016: Impersonation Audit Yok
**Seviye:** YÜKSEK
**CVSS:** 5.0
**Dosya:** `apps/api/src/routes/owner.ts:196-221`

### Düzeltme
```typescript
router.post('/impersonate', async (req, res) => {
  const { tenantId } = z.object({ tenantId: z.string() }).parse(req.body);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  // AUDIT LOG
  await prisma.audit.create({
    data: {
      tenantId,
      action: 'OWNER_IMPERSONATION_START',
      details: {
        ownerId: req.auth?.ownerId,
        targetTenantId: tenantId,
        targetTenantName: tenant.name,
        ipAddress: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      }
    }
  });

  // Admin notification
  await prisma.adminNotification.create({
    data: {
      type: 'security',
      message: `Owner impersonated tenant: ${tenant.name}`,
      details: {
        ownerId: req.auth?.ownerId,
        tenantId,
        tenantName: tenant.name
      }
    }
  });

  // Token oluştur...
});
```

---

## SEC-017: SSRF via imageUrl
**Seviye:** YÜKSEK
**CVSS:** 5.0
**Dosya:** `apps/api/src/routes/ugc.ts:14-24`

### Mevcut Kod
```typescript
const createJobSchema = z.object({
  imageUrl: z.string().url(),  // Sadece format!
});
```

### Düzeltme
```typescript
// apps/api/src/utils/urlValidation.ts
import { URL } from 'url';
import dns from 'dns/promises';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',  // AWS metadata
  '169.254.170.2',    // ECS metadata
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^fc00:/,
  /^fe80:/,
];

export const validateExternalUrl = async (urlString: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Protocol check
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP/HTTPS allowed');
  }

  // Blocked hosts
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error('Blocked host');
  }

  // Private IP check
  if (PRIVATE_IP_RANGES.some(range => range.test(hostname))) {
    throw new Error('Private IP not allowed');
  }

  // DNS resolution check (prevent DNS rebinding)
  try {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (PRIVATE_IP_RANGES.some(range => range.test(addr))) {
        throw new Error('Resolved to private IP');
      }
    }
  } catch (err) {
    if (err.code !== 'ENOTFOUND') {
      throw err;
    }
  }

  return url;
};

// Route'da kullanım
router.post('/jobs', ..., async (req, res) => {
  const body = createJobSchema.parse(req.body);

  // SSRF validation
  await validateExternalUrl(body.imageUrl);

  // ... devam
});
```

---

## SEC-018: Unbounded Query DoS
**Seviye:** YÜKSEK
**CVSS:** 4.9
**Dosya:** `apps/api/src/routes/videos.ts:148-151`

### Düzeltme
```prisma
// schema.prisma - Composite index ekle
model Job {
  // ... existing fields

  @@index([tenantId, status])
  @@index([tenantId, createdAt])
}
```

```typescript
// Whitelist status values
const VALID_STATUSES = ['pending', 'running', 'processing', 'completed', 'done', 'failed', 'error'];

router.get('/jobs', ..., async (req, res) => {
  const status = req.query.status as string | undefined;

  // Validate status
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status',
      allowed: VALID_STATUSES
    });
  }

  const where: Prisma.JobWhereInput = {
    tenantId: req.auth.tenantId
  };

  if (status) {
    where.status = status as JobStatus;
  }

  // Pagination with cursor for large datasets
  const jobs = await prisma.job.findMany({
    where,
    take: Math.min(limit, 50),
    skip: offset,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      productName: true,
      createdAt: true,
      // Sensitive fields exclude
    }
  });

  res.json({ jobs });
});
```

---

## Uygulama Takvimi

```
HAFTA 1 (Kritik)
├── Gün 1-2: SEC-001, SEC-002 (Callback güvenliği)
├── Gün 3: SEC-003 (IDOR)
├── Gün 4: SEC-004 (Race condition)
├── Gün 5: SEC-005, SEC-006 (S3 + Tenant doğrulama)

HAFTA 2 (Yüksek - Bölüm 1)
├── Gün 1: SEC-007 (Negatif sayı)
├── Gün 2: SEC-008 (Webhook replay)
├── Gün 3: SEC-009, SEC-010 (CORS, JWT)
├── Gün 4: SEC-011 (Coupon)
├── Gün 5: SEC-012 (Upload DoS)

HAFTA 3 (Yüksek - Bölüm 2)
├── Gün 1: SEC-013 (AES)
├── Gün 2: SEC-014 (Error leak)
├── Gün 3: SEC-015 (S3 ACL)
├── Gün 4: SEC-016 (Audit)
├── Gün 5: SEC-017, SEC-018 (SSRF, Query DoS)

HAFTA 4 (Orta + Düşük)
├── Gün 1-2: SEC-019, SEC-020 (CSRF, MIME)
├── Gün 3: SEC-021, SEC-022 (State machine, Email)
├── Gün 4: SEC-023, SEC-024 (Timing, Cascade)
├── Gün 5: SEC-025, SEC-026, SEC-027, SEC-028
```

---

## Test Planı

### Birim Testleri
```typescript
describe('Security Tests', () => {
  describe('SEC-001: Callback Auth', () => {
    it('should reject callback without signature', async () => {
      const res = await request(app)
        .post('/api/videos/jobs/123/callback')
        .send({ status: 'done' });
      expect(res.status).toBe(401);
    });

    it('should reject callback with invalid signature', async () => {
      const res = await request(app)
        .post('/api/videos/jobs/123/callback')
        .set('x-webhook-signature', 'invalid')
        .set('x-webhook-timestamp', Date.now().toString())
        .send({ status: 'done' });
      expect(res.status).toBe(401);
    });
  });

  describe('SEC-002: Timing Attack', () => {
    it('should use constant-time comparison', async () => {
      const times: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = process.hrtime.bigint();
        await request(app)
          .post('/api/ugc/jobs/123/upload-video')
          .set('x-internal-api-token', 'a'.repeat(i));
        const end = process.hrtime.bigint();
        times.push(Number(end - start));
      }

      // Variance should be minimal (constant time)
      const variance = calculateVariance(times);
      expect(variance).toBeLessThan(1000000); // 1ms variance max
    });
  });

  describe('SEC-004: Race Condition', () => {
    it('should prevent quota overflow', async () => {
      // Tenant with 1 video remaining
      const tenant = await createTenant({ quotaRemaining: 1 });

      // 10 concurrent requests
      const promises = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/videos')
          .set('Authorization', `Bearer ${tenant.token}`)
          .send({ video_count: 1 })
      );

      const results = await Promise.allSettled(promises);
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);

      expect(succeeded.length).toBe(1); // Sadece 1 başarılı
    });
  });
});
```

### Penetrasyon Test Checklist
- [ ] OWASP ZAP full scan
- [ ] Burp Suite manual testing
- [ ] Rate limit bypass attempts
- [ ] JWT token manipulation
- [ ] IDOR enumeration
- [ ] SSRF payload testing
- [ ] File upload bypass
- [ ] SQL/NoSQL injection
- [ ] XSS reflection

---

## Sonuç

Bu rapor, 28 güvenlik açığını dokümante etmekte ve öncelik sırasına göre düzeltme planı sunmaktadır. Kritik açıklar 24 saat içinde, yüksek seviye açıklar 2 hafta içinde düzeltilmelidir.

**Toplam Tahmini İş:** ~80 saat
**Önerilen Ekip:** 2 backend geliştirici + 1 güvenlik uzmanı
**Öncelik:** Production'a deploy öncesi KRİTİK düzeltmeler tamamlanmalı
