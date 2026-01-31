import { PrismaClient, UserRole } from '@prisma/client';
import { addMonths } from 'date-fns';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

const prisma = new PrismaClient();

const PLAN_DEFINITIONS = [
  {
    name: 'Starter',
    code: 'starter',
    monthlyPriceUsd: 69,
    monthlyVideoLimit: 10,
  },
  {
    name: 'Growth',
    code: 'growth',
    monthlyPriceUsd: 179,
    monthlyVideoLimit: 30,
  },
  {
    name: 'Scale',
    code: 'scale',
    monthlyPriceUsd: 499,
    monthlyVideoLimit: 100,
  },
] as const;

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowProdSeed = process.env.ALLOW_PROD_SEED === 'true';
  const allowWipe = process.env.SEED_RESET === 'true';
  const seedTestTenants =
    process.env.SEED_TEST_TENANTS === undefined
      ? !isProduction
      : process.env.SEED_TEST_TENANTS === 'true';

  if (isProduction && !allowProdSeed) {
    throw new Error('Refusing to run seed in production. Set ALLOW_PROD_SEED=true to override.');
  }

  // 1. Clean Slate: Delete everything in correct order to respect FKs (explicit only)
  if (allowWipe) {
    console.log('Cleaning database (destructive reset)...');
    await prisma.adminNotification.deleteMany();
    await prisma.usage.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.audit.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.job.deleteMany();
    await prisma.user.deleteMany();
    await prisma.owner.deleteMany();
    await prisma.tenant.deleteMany();
  } else {
    console.log('Skipping destructive deletes. Set SEED_RESET=true to wipe data.');
  }

  // We keep plans usually, but upsert handles them.

  // 2. Create Plans
  const plansByCode = await seedPlans();

  // 3. Create Super Admin (only if missing)
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    throw new Error('SEED_OWNER_EMAIL is required. Please set it in your .env file.');
  }
  const existingOwner = await prisma.owner.findUnique({
    where: { email: ownerEmail },
  });

  if (existingOwner) {
    console.log(`Owner already exists: ${ownerEmail}`);
  } else {
    const rawOwnerPassword =
      process.env.SEED_OWNER_PASSWORD?.trim() ||
      `${crypto.randomBytes(12).toString('base64url')}!Aa1`;
    const ownerPassword = await hashPassword(rawOwnerPassword);

    await prisma.owner.create({
      data: {
        email: ownerEmail,
        passwordHash: ownerPassword,
      },
    });
    console.log(`✅ Super Admin created: ${ownerEmail}`);
    console.log(`📧 Email: ${ownerEmail}`);
    if (process.env.SEED_OWNER_PASSWORD) {
      console.log('🔑 Password: (provided via SEED_OWNER_PASSWORD)');
    } else {
      console.log(`🔑 Password: ${rawOwnerPassword}`);
      console.log('⚠️  Store this password securely. Set SEED_OWNER_PASSWORD to use a fixed value.');
    }
  }

  // 4. Create Test Tenants (opt-in for production)
  if (seedTestTenants) {
    const rawTenantPassword = process.env.SEED_TENANT_PASSWORD?.trim() || 'Test1234!';
    const testPassword = await hashPassword(rawTenantPassword);
    const billingCycleStart = new Date();
    const tenants = [
      { email: 'start@test.com', plan: 'starter', name: 'Starter Corp' },
      { email: 'growth@test.com', plan: 'growth', name: 'Growth Ltd' },
      { email: 'scale@test.com', plan: 'scale', name: 'Scale Inc' },
    ];

    let createdTenantUsers = 0;
    for (const t of tenants) {
      const plan = plansByCode[t.plan];
      if (!plan) continue;

      const tenantId = `tenant-${t.plan}`;
      const existingTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      const tenant =
        existingTenant ??
        (await prisma.tenant.create({
          data: {
            id: tenantId,
            name: t.name,
            planId: plan.id,
            monthlyVideoLimit: plan.monthlyVideoLimit,
            videosUsedThisCycle: 0,
            resetDay: 1,
            n8nBaseUrl: 'https://example-n8n',
            n8nProcessPath: '/webhook/synthetic',
            status: 'active',
            billingNotes: 'Seeded test user',
            billingCycleStart,
            nextBillingDate: addMonths(billingCycleStart, 1),
            paymentStatus: 'active_paid',
            bonusCredits: 0,
          }
        }));

      if (existingTenant) {
        console.log(`Tenant already exists: ${t.email} (${t.plan})`);
      } else {
        console.log(`Created Tenant: ${t.email} (${t.plan})`);
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: t.email },
      });
      if (existingUser) {
        console.log(`Tenant admin already exists: ${t.email}`);
        continue;
      }

      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: t.email,
          role: UserRole.tenant_admin,
          passwordHash: testPassword,
        }
      });
      createdTenantUsers += 1;
    }

    if (createdTenantUsers > 0 && !process.env.SEED_TENANT_PASSWORD) {
      console.log(`🔑 Tenant admin password (default): ${rawTenantPassword}`);
      console.log('⚠️  Set SEED_TENANT_PASSWORD to override.');
    }
  } else {
    console.log('Skipping test tenants. Set SEED_TEST_TENANTS=true to create them.');
  }

  console.log('Seed complete');
}

async function seedPlans() {
  const entries: Record<string, Awaited<ReturnType<typeof prisma.plan.create>>> = {};
  for (const plan of PLAN_DEFINITIONS) {
    const record = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        monthlyPriceUsd: plan.monthlyPriceUsd,
        monthlyVideoLimit: plan.monthlyVideoLimit,
      },
      create: {
        name: plan.name,
        code: plan.code,
        monthlyPriceUsd: plan.monthlyPriceUsd,
        monthlyVideoLimit: plan.monthlyVideoLimit,
      },
    });
    entries[plan.code] = record;
  }
  return entries;
}

main().finally(async () => {
  await prisma.$disconnect();
});
