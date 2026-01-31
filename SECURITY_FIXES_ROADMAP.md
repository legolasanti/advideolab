# Kritik Güvenlik Açıkları Düzeltme Yol Planı

## Özet
Bu belge, güvenlik analizinde tespit edilen **5 KRİTİK** ve **13 YÜKSEK** seviyeli güvenlik açığının düzeltilmesi için detaylı yol haritasını içerir.

---

## FAZA 1: KRİTİK AÇIKLAR (0-48 Saat)

### 1.1 HMAC Signature Doğrulama Sistemi
**Etkilenen Dosyalar:**
- `apps/api/src/lib/signature.ts` (YENİ)
- `apps/api/src/routes/videos.ts`
- `apps/api/src/routes/ugc.ts`
- `apps/api/src/services/ugcVideoService.ts`
- `apps/api/src/services/jobService.ts`

**Uygulama:**
```typescript
// apps/api/src/lib/signature.ts
import crypto from 'crypto';
import { env } from '../config/env';

const SIGNATURE_VALIDITY_MS = 5 * 60 * 1000; // 5 dakika

export const generateSignature = (payload: object, timestamp: number): string => {
  const data = JSON.stringify(payload) + timestamp;
  return crypto
    .createHmac('sha256', env.WEBHOOK_SIGNING_SECRET || env.JWT_SECRET)
    .update(data)
    .digest('hex');
};

export const verifySignature = (
  payload: object,
  signature: string,
  timestamp: number
): boolean => {
  // Timestamp kontrolü - replay attack önleme
  const now = Date.now();
  if (Math.abs(now - timestamp) > SIGNATURE_VALIDITY_MS) {
    return false;
  }

  const expectedSignature = generateSignature(payload, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

export const createSignedPayload = (payload: object) => {
  const timestamp = Date.now();
  const signature = generateSignature(payload, timestamp);
  return { payload, timestamp, signature };
};
```

**Callback Endpoint Güncelleme:**
```typescript
// videos.ts callback route
router.post('/jobs/:id/callback', async (req, res) => {
  const signature = req.header('x-webhook-signature');
  const timestamp = parseInt(req.header('x-webhook-timestamp') || '0', 10);

  if (!signature || !verifySignature(req.body, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // ... mevcut kod
});
```

---

### 1.2 Race Condition - Atomik Kota Kontrolü
**Etkilenen Dosyalar:**
- `apps/api/src/services/quota.ts`

**Uygulama:**
```typescript
// Mevcut (HATALI):
export const enforceTenantQuota = (tenant, requestedVideos = 1) => {
  if (tenant.videosUsedThisCycle + requestedVideos > limit) {
    throw new QuotaExceededError();
  }
};

// Düzeltilmiş (ATOMİK):
export const atomicIncrementUsage = async (
  tenantId: string,
  requestedVideos: number,
  limit: number
): Promise<boolean> => {
  try {
    await prisma.$executeRaw`
      UPDATE "Tenant"
      SET "videosUsedThisCycle" = "videosUsedThisCycle" + ${requestedVideos}
      WHERE "id" = ${tenantId}
        AND "videosUsedThisCycle" + ${requestedVideos} <= ${limit}
    `;

    // Etkilenen satır sayısını kontrol et
    const result = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { videosUsedThisCycle: true }
    });

    return true;
  } catch (error) {
    throw new QuotaExceededError();
  }
};

// Alternatif: Prisma transaction ile
export const atomicQuotaCheck = async (
  tenantId: string,
  requestedVideos: number
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: {
        videosUsedThisCycle: true,
        monthlyVideoLimit: true,
        bonusCredits: true,
        planDetails: { select: { monthlyVideoLimit: true } }
      }
    });

    if (!tenant) throw new Error('Tenant not found');

    const limit = tenant.monthlyVideoLimit ??
                  tenant.planDetails?.monthlyVideoLimit ?? 0;
    const available = limit + (tenant.bonusCredits ?? 0) - tenant.videosUsedThisCycle;

    if (requestedVideos > available) {
      throw new QuotaExceededError();
    }

    // Atomik güncelleme - transaction içinde
    await tx.tenant.update({
      where: { id: tenantId },
      data: { videosUsedThisCycle: { increment: requestedVideos } }
    });
  }, {
    isolationLevel: 'Serializable' // En güçlü izolasyon
  });
};
```

---

### 1.3 IDOR Düzeltmesi - JWT Tenant Doğrulama
**Etkilenen Dosyalar:**
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/tenantResolver.ts`

**Uygulama:**
```typescript
// apps/api/src/middleware/auth.ts - EK DOĞRULAMA
export const validateTenantClaim = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.auth?.userId || !req.auth?.tenantId) {
    return next();
  }

  // Owner impersonation durumu
  if (req.auth.originalRole === 'owner_superadmin' && req.auth.impersonatedTenantId) {
    return next(); // Owner herhangi bir tenant'ı impersonate edebilir
  }

  // Normal kullanıcı için tenant doğrulaması
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { tenantId: true }
  });

  if (!user || user.tenantId !== req.auth.tenantId) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }

  next();
};

// Route'lara ekle:
router.get('/jobs/:id', requireAuth, validateTenantClaim, requireTenantRole([...]), ...)
```

---

### 1.4 S3 Path Traversal Koruması
**Etkilenen Dosyalar:**
- `apps/api/src/lib/s3.ts`
- `apps/api/src/utils/fileValidation.ts`

**Uygulama:**
```typescript
// apps/api/src/lib/s3.ts
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'];

const sanitizeExtension = (ext: string): string => {
  // Sadece alfanumerik karakterler
  const cleaned = ext.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!ALLOWED_EXTENSIONS.includes(cleaned)) {
    throw new Error(`Invalid file extension: ${ext}`);
  }

  return cleaned;
};

export const generateAssetKey = (
  tenantId: string,
  type: 'input' | 'output',
  jobId: string,
  ext: string
): string => {
  // Tüm bileşenleri sanitize et
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeJobId = jobId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeExt = sanitizeExtension(ext);
  const random = crypto.randomBytes(4).toString('hex');

  // Path traversal karakterlerini engelle
  if (safeTenantId.includes('..') || safeJobId.includes('..')) {
    throw new Error('Invalid path component');
  }

  return `${safeTenantId}/${type}/${safeJobId}-${random}.${safeExt}`;
};
```

---

### 1.5 N8N URL Güvenliği (Tenant tarafından ayarlanamaz)
**Durum:** Zaten düzeltildi - n8n config artık sadece Owner tarafından global olarak ayarlanıyor.
**Doğrulama gerekli:** Tenant'ların eski n8n endpoint'lerine erişememesi kontrol edilmeli.

---

## FAZA 2: YÜKSEK SEVİYE AÇIKLAR (48 Saat - 1 Hafta)

### 2.1 CORS Origin Whitelist
**Etkilenen Dosyalar:**
- `apps/api/src/app.ts`
- `apps/api/src/config/env.ts`

**Uygulama:**
```typescript
// apps/api/src/config/env.ts - YENİ ALAN
allowedOrigins: z.string().optional().transform(val =>
  val ? val.split(',').map(s => s.trim()) : ['http://localhost:4173']
),

// apps/api/src/app.ts
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Preflight request veya same-origin
    if (!origin) {
      return callback(null, true);
    }

    if (env.allowedOrigins.includes(origin) || env.isDev) {
      return callback(null, true);
    }

    callback(new Error('CORS policy violation'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-api-token'],
};

app.use(cors(corsOptions));
```

---

### 2.2 JWT Token Süresini Kısalt + Refresh Token
**Etkilenen Dosyalar:**
- `apps/api/src/utils/jwt.ts`
- `apps/api/src/routes/auth.ts`

**Uygulama:**
```typescript
// apps/api/src/utils/jwt.ts
export const signToken = (payload: AuthClaims) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1h' }); // 12h -> 1h
};

export const signRefreshToken = (userId: string) => {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.JWT_SECRET, { expiresIn: '7d' });
};

// apps/api/src/routes/auth.ts - YENİ ENDPOINT
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as { sub: string; type: string };

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Kullanıcıyı bul ve yeni token üret
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newToken = signToken({
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId
    });

    res.json({ token: newToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});
```

---

### 2.3 AES Key Derivation Düzeltmesi
**Etkilenen Dosyalar:**
- `apps/api/src/lib/crypto.ts`

**Uygulama:**
```typescript
// apps/api/src/lib/crypto.ts
import crypto from 'crypto';
import { env } from '../config/env';

// Key derivation with scrypt
const SALT = 'amazon-resim-encryption-salt-v1'; // Sabit salt (veya env'den)
const deriveKey = (): Buffer => {
  return crypto.scryptSync(env.ENCRYPTION_KEY, SALT, 32);
};

const key = deriveKey();

export const encrypt = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decrypt = (encoded: string): string => {
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

### 2.4 Production Error Handler
**Etkilenen Dosyalar:**
- `apps/api/src/middleware/errorHandler.ts`

**Uygulama:**
```typescript
// apps/api/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/errors';
import { env } from '../config/env';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Sadece development'ta detaylı log
  if (env.isDev) {
    console.error(err);
  } else {
    // Production'da sadece mesaj (stack trace yok)
    console.error(`[ERROR] ${err.name}: ${err.message}`);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      // Production'da detay verme
      ...(env.isDev && { details: err.flatten() })
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: env.isDev ? err.message : 'Request failed'
    });
  }

  // Generic error - hiçbir detay verme
  return res.status(500).json({ error: 'Internal Server Error' });
};
```

---

### 2.5 Impersonation Audit Logging
**Etkilenen Dosyalar:**
- `apps/api/src/routes/owner.ts`

**Uygulama:**
```typescript
// apps/api/src/routes/owner.ts
router.post('/impersonate', async (req, res) => {
  const { tenantId } = z.object({ tenantId: z.string() }).parse(req.body);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  // AUDIT LOG EKLE
  await prisma.audit.create({
    data: {
      tenantId,
      action: 'OWNER_IMPERSONATION',
      details: {
        ownerId: req.auth?.ownerId,
        ownerEmail: req.auth?.sub, // veya ayrı query
        targetTenant: tenant.name,
        timestamp: new Date().toISOString(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    }
  });

  // ... mevcut token oluşturma kodu
});
```

---

### 2.6 File Upload MIME Type Doğrulama
**Etkilenen Dosyalar:**
- `apps/api/src/utils/fileValidation.ts` (YENİ)
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/ugc.ts`

**Uygulama:**
```typescript
// apps/api/src/utils/fileValidation.ts
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

export const validateImageBuffer = async (buffer: Buffer): Promise<void> => {
  const type = await fileTypeFromBuffer(buffer);

  if (!type || !ALLOWED_IMAGE_MIMES.includes(type.mime)) {
    throw new Error(`Invalid image type: ${type?.mime || 'unknown'}`);
  }
};

export const validateVideoBuffer = async (buffer: Buffer): Promise<void> => {
  const type = await fileTypeFromBuffer(buffer);

  if (!type || !ALLOWED_VIDEO_MIMES.includes(type.mime)) {
    throw new Error(`Invalid video type: ${type?.mime || 'unknown'}`);
  }
};

// Route'larda kullanım:
if (req.file) {
  await validateImageBuffer(req.file.buffer);
  // ... upload işlemi
}
```

---

### 2.7 SSRF Koruması - Domain Whitelist
**Etkilenen Dosyalar:**
- `apps/api/src/services/jobService.ts`
- `apps/api/src/utils/urlValidation.ts` (YENİ)

**Uygulama:**
```typescript
// apps/api/src/utils/urlValidation.ts
import { URL } from 'url';

const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254', // AWS metadata
];

const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'gopher:'];

export const validateExternalUrl = (urlString: string): URL => {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Protokol kontrolü
  if (BLOCKED_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`Blocked protocol: ${url.protocol}`);
  }

  // Host kontrolü
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTS.includes(hostname)) {
    throw new Error(`Blocked host: ${hostname}`);
  }

  // Private IP range kontrolü
  if (isPrivateIP(hostname)) {
    throw new Error('Private IP addresses are not allowed');
  }

  // Sadece HTTP/HTTPS
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are allowed');
  }

  return url;
};

const isPrivateIP = (host: string): boolean => {
  // IPv4 private ranges
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^0\./,
  ];

  return privateRanges.some(range => range.test(host));
};

// Kullanım:
const downloadExternalAsset = async (urlString: string) => {
  const url = validateExternalUrl(urlString); // SSRF koruması

  const response = await axios.get(url.href, {
    timeout: 30_000, // 180s -> 30s
    maxContentLength: 50 * 1024 * 1024, // 50MB max
  });
  // ...
};
```

---

### 2.8 Rate Limiting Güçlendirmesi
**Etkilenen Dosyalar:**
- `apps/api/src/app.ts`
- `apps/api/src/middleware/rateLimiter.ts` (YENİ)

**Uygulama:**
```typescript
// apps/api/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Genel limit
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: env.isDev ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});

// Video oluşturma - sıkı limit
export const videoCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 5, // Dakikada 5 video
  standardHeaders: true,
  keyGenerator: (req) => req.auth?.tenantId || req.ip, // Tenant bazlı
  message: { error: 'Video creation rate limit exceeded' }
});

// Auth endpoints - brute force koruması
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 dakika
  max: 10, // 15 dakikada 10 deneme
  standardHeaders: true,
  message: { error: 'Too many login attempts' }
});

// Coupon validation - brute force koruması
export const couponLimiter = rateLimit({
  windowMs: 60_000,
  max: 10, // Dakikada 10 deneme
  standardHeaders: true,
  message: { error: 'Too many coupon validation attempts' }
});

// Callback endpoints - n8n için yüksek limit
export const callbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 100, // n8n callback'leri için
  standardHeaders: true,
  keyGenerator: () => 'callback-global', // Global bucket
});
```

---

## FAZA 3: ORTA SEVİYE İYİLEŞTİRMELER (1-2 Hafta)

### 3.1 Bcrypt Rounds Artırma
```typescript
// apps/api/src/services/password.ts
export const hashPassword = async (plain: string) => bcrypt.hash(plain, 12); // 10 -> 12
```

### 3.2 S3 Private ACL + Signed URLs
```typescript
// apps/api/src/lib/s3.ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Upload artık private
export const uploadBuffer = async (...) => {
  await client.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ACL: 'private', // public-read -> private
    ContentType: contentType,
  }));
  // ...
};

// Signed URL oluştur
export const getSignedAssetUrl = async (key: string, expiresIn = 3600): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
};
```

### 3.3 Blog Slug Sanitization
```typescript
// apps/api/src/routes/owner.ts
const sanitizeSlug = (slug: string): string => {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
};
```

### 3.4 Son Admin Silme Koruması
```typescript
// apps/api/src/routes/admin.ts
router.delete('/users/:id', ..., async (req, res) => {
  // Kendi kendini silemez
  if (req.params.id === req.auth?.userId) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  // Son admin kontrolü
  const adminCount = await prisma.user.count({
    where: {
      tenantId: req.auth.tenantId,
      role: 'tenant_admin'
    }
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { role: true }
  });

  if (targetUser?.role === 'tenant_admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin' });
  }

  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
```

---

## UYGULAMA SIRASI

| Öncelik | Görev | Süre | Bağımlılık |
|---------|-------|------|------------|
| 1 | HMAC Signature sistemi | 2 saat | - |
| 2 | Video callback güvenliği | 1 saat | #1 |
| 3 | UGC callback güvenliği | 1 saat | #1 |
| 4 | Atomik kota kontrolü | 2 saat | - |
| 5 | IDOR düzeltmesi | 1 saat | - |
| 6 | S3 path traversal | 1 saat | - |
| 7 | CORS whitelist | 30 dk | - |
| 8 | JWT süre kısaltma | 30 dk | - |
| 9 | AES key derivation | 30 dk | - |
| 10 | Error handler | 30 dk | - |
| 11 | Impersonation audit | 30 dk | - |
| 12 | File MIME validation | 1 saat | - |
| 13 | Rate limiting | 1 saat | - |
| 14 | SSRF koruması | 1 saat | - |

**Toplam Tahmini Süre:** ~13 saat

---

## TEST PLANI

### Birim Testleri
```typescript
// __tests__/security/signature.test.ts
describe('HMAC Signature', () => {
  it('should generate valid signature', () => {...});
  it('should reject expired timestamp', () => {...});
  it('should reject invalid signature', () => {...});
  it('should prevent replay attacks', () => {...});
});

// __tests__/security/quota.test.ts
describe('Atomic Quota', () => {
  it('should prevent race condition', async () => {
    // 10 concurrent requests with 1 quota left
    const promises = Array(10).fill(null).map(() =>
      createJob(tenantId)
    );
    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBe(1); // Sadece 1 başarılı olmalı
  });
});
```

### Entegrasyon Testleri
- [ ] Callback endpoint'leri geçersiz signature ile 401 döndürmeli
- [ ] CORS farklı origin'den 403 döndürmeli
- [ ] Başka tenant'ın job'una erişim 403 döndürmeli
- [ ] Path traversal denemesi 400 döndürmeli

### Penetrasyon Testleri
- [ ] OWASP ZAP ile tarama
- [ ] Burp Suite ile manuel test
- [ ] Rate limit bypass denemeleri

---

## DEPLOYMENT CHECKLIST

- [ ] Tüm environment variable'lar güncellendi
- [ ] Database migration'ları çalıştırıldı
- [ ] Yeni bağımlılıklar yüklendi (`file-type` paketi)
- [ ] CORS allowed origins konfigüre edildi
- [ ] Webhook signing secret oluşturuldu
- [ ] n8n workflow'ları yeni signature header'ları gönderiyor
- [ ] Frontend refresh token mantığı eklendi
- [ ] Mevcut aktif session'lar invalidate edildi (JWT süre değişikliği)
- [ ] S3 bucket policy güncellendi (private ACL için)
- [ ] CloudFront signed URL konfigürasyonu yapıldı

---

## NOTLAR

1. **Geriye Dönük Uyumluluk:** JWT süre değişikliği mevcut kullanıcıları logout yapacak. Kullanıcılara bildirim gönderilmeli.

2. **n8n Güncelleme:** Webhook callback'leri artık signature header'ları içermeli. n8n workflow'larının güncellenmesi gerekiyor.

3. **Frontend Güncelleme:**
   - Refresh token mantığı eklenmeli
   - CORS hataları için graceful handling
   - Token expire olduğunda otomatik refresh

4. **Monitoring:**
   - Rate limit hit'leri loglanmalı
   - Başarısız auth denemeleri izlenmeli
   - Signature doğrulama hataları alert oluşturmalı
