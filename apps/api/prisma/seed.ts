import { PrismaClient, UserRole } from '@prisma/client';
import { addMonths } from 'date-fns';
import bcrypt from 'bcryptjs';

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
  // 1. Clean Slate: Delete everything in correct order to respect FKs
  console.log('Cleaning database...');
  await prisma.adminNotification.deleteMany();
  await prisma.usage.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.audit.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.tenant.deleteMany();

  // We keep plans usually, but upsert handles them.

  // 2. Create Plans
  const plansByCode = await seedPlans();

  // 3. Create Super Admin
  const ownerEmail = 'abrahamceviz@gmail.com';
  const ownerPassword = await hashPassword('Adm!n2026#Str0ng');

  await prisma.owner.create({
    data: {
      email: ownerEmail,
      passwordHash: ownerPassword,
    },
  });
  console.log(`✅ Super Admin created: ${ownerEmail}`);
  console.log(`📧 Email: ${ownerEmail}`);
  console.log(`🔑 Password: Adm!n2026#Str0ng`);

  // 4. Create Test Tenants
  const testPassword = await hashPassword('Test1234!');
  const billingCycleStart = new Date();

  const tenants = [
    { email: 'start@test.com', plan: 'starter', name: 'Starter Corp' },
    { email: 'growth@test.com', plan: 'growth', name: 'Growth Ltd' },
    { email: 'scale@test.com', plan: 'scale', name: 'Scale Inc' },
  ];

  for (const t of tenants) {
    const plan = plansByCode[t.plan];
    if (!plan) continue;

    const tenant = await prisma.tenant.create({
      data: {
        id: `tenant-${t.plan}`,
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
    });

    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: t.email,
        role: UserRole.tenant_admin,
        passwordHash: testPassword,
      }
    });
    console.log(`Created Tenant: ${t.email} (${t.plan})`);
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
