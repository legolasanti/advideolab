import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { hashPassword } from '../services/password';
import { TenantType } from '@prisma/client';

const router = Router();

// All enterprise routes require authentication
router.use(requireAuth);

// Middleware to check enterprise tenant
const requireEnterprise = async (req: any, res: any, next: any) => {
  const tenantId = req.auth?.tenantId;
  if (!tenantId) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { enterpriseSettings: true },
  });

  if (!tenant || tenant.tenantType !== 'enterprise') {
    return res.status(403).json({ error: 'enterprise_only' });
  }

  req.enterpriseTenant = tenant;
  req.enterpriseSettings = tenant.enterpriseSettings;
  next();
};

// === Enterprise Dashboard ===
router.get('/dashboard', requireEnterprise, async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const settings = req.enterpriseSettings;

  // Get sub-companies
  const subCompanies = await prisma.tenant.findMany({
    where: { parentTenantId: tenantId },
    include: {
      _count: { select: { users: true, jobs: true } },
    },
  });

  // Get all users in enterprise (including sub-companies)
  const subCompanyIds = subCompanies.map((s) => s.id);
  const allTenantIds = [tenantId, ...subCompanyIds];

  const totalUsers = await prisma.user.count({
    where: { tenantId: { in: allTenantIds } },
  });

  // Get total jobs this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyJobs = await prisma.job.count({
    where: {
      tenantId: { in: allTenantIds },
      createdAt: { gte: startOfMonth },
    },
  });

  // Get recent jobs
  const recentJobs = await prisma.job.findMany({
    where: { tenantId: { in: allTenantIds } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      tenant: { select: { name: true } },
      user: { select: { email: true } },
    },
  });

  // Calculate allocated credits
  const allocatedCredits = subCompanies.reduce((sum, s) => sum + (s.allocatedCredits ?? 0), 0);
  const remainingCredits = (settings?.totalVideoCredits ?? 0) - allocatedCredits;

  res.json({
    stats: {
      totalSubCompanies: subCompanies.length,
      maxSubCompanies: settings?.maxSubCompanies ?? 0,
      totalUsers,
      maxAdditionalUsers: settings?.maxAdditionalUsers ?? 0,
      totalVideoCredits: settings?.totalVideoCredits ?? 0,
      allocatedCredits,
      remainingCredits,
      monthlyJobs,
    },
    subCompanies: subCompanies.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      allocatedCredits: s.allocatedCredits ?? 0,
      usersCount: s._count.users,
      jobsCount: s._count.jobs,
      createdAt: s.createdAt,
    })),
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      status: j.status,
      tenantName: j.tenant.name,
      userEmail: j.user?.email ?? null,
      createdAt: j.createdAt,
    })),
  });
});

// === Sub-Companies CRUD ===

// List sub-companies
router.get('/sub-companies', requireEnterprise, async (req: any, res) => {
  const tenantId = req.auth.tenantId;

  const subCompanies = await prisma.tenant.findMany({
    where: { parentTenantId: tenantId },
    include: {
      _count: { select: { users: true, jobs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    subCompanies.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      allocatedCredits: s.allocatedCredits ?? 0,
      usersCount: s._count.users,
      jobsCount: s._count.jobs,
      createdAt: s.createdAt,
    })),
  );
});

// Create sub-company
const createSubCompanySchema = z.object({
  name: z.string().min(2).max(128),
  allocatedCredits: z.coerce.number().int().min(0).optional(),
  adminEmail: z.string().email().optional(),
  adminPassword: z.string().min(8).max(128).optional(),
});

router.post('/sub-companies', requireEnterprise, requireTenantRole(['tenant_admin']), async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const settings = req.enterpriseSettings;

  let body;
  try {
    body = createSubCompanySchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'validation_error', issues: err.issues });
    }
    throw err;
  }

  // Check sub-company limit
  const currentCount = await prisma.tenant.count({
    where: { parentTenantId: tenantId },
  });

  if (currentCount >= (settings?.maxSubCompanies ?? 0)) {
    return res.status(400).json({ error: 'sub_company_limit_reached' });
  }

  // Check credit allocation
  if (body.allocatedCredits) {
    const existingSubCompanies = await prisma.tenant.findMany({
      where: { parentTenantId: tenantId },
      select: { allocatedCredits: true },
    });

    const totalAllocated = existingSubCompanies.reduce((sum, s) => sum + (s.allocatedCredits ?? 0), 0);
    const remaining = (settings?.totalVideoCredits ?? 0) - totalAllocated;

    if (body.allocatedCredits > remaining) {
      return res.status(400).json({
        error: 'insufficient_credits',
        remaining,
        requested: body.allocatedCredits,
      });
    }
  }

  // Check if admin email is already in use
  if (body.adminEmail) {
    const existingUser = await prisma.user.findUnique({
      where: { email: body.adminEmail },
    });
    if (existingUser) {
      return res.status(400).json({ error: 'email_already_registered' });
    }
  }

  // Create sub-company
  const result = await prisma.$transaction(async (tx) => {
    const subCompany = await tx.tenant.create({
      data: {
        name: body.name,
        status: 'active',
        tenantType: 'sub_company' as TenantType,
        parentTenantId: tenantId,
        allocatedCredits: body.allocatedCredits ?? 0,
      },
    });

    // Create admin user if provided
    let adminUser = null;
    if (body.adminEmail && body.adminPassword) {
      const passwordHash = await hashPassword(body.adminPassword);
      adminUser = await tx.user.create({
        data: {
          email: body.adminEmail,
          passwordHash,
          emailVerifiedAt: new Date(),
          role: 'tenant_admin',
          tenantId: subCompany.id,
        },
      });
    }

    return { subCompany, adminUser };
  });

  res.status(201).json({
    id: result.subCompany.id,
    name: result.subCompany.name,
    allocatedCredits: result.subCompany.allocatedCredits ?? 0,
    adminEmail: result.adminUser?.email,
  });
});

// Update sub-company
const updateSubCompanySchema = z.object({
  name: z.string().min(2).max(128).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

router.put('/sub-companies/:id', requireEnterprise, requireTenantRole(['tenant_admin']), async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const { id } = req.params;

  let body;
  try {
    body = updateSubCompanySchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'validation_error', issues: err.issues });
    }
    throw err;
  }

  // Verify sub-company belongs to this enterprise
  const subCompany = await prisma.tenant.findFirst({
    where: { id, parentTenantId: tenantId },
  });

  if (!subCompany) {
    return res.status(404).json({ error: 'sub_company_not_found' });
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: body,
  });

  res.json({
    id: updated.id,
    name: updated.name,
    status: updated.status,
    allocatedCredits: updated.allocatedCredits ?? 0,
  });
});

// Delete sub-company
router.delete('/sub-companies/:id', requireEnterprise, requireTenantRole(['tenant_admin']), async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const { id } = req.params;

  // Verify sub-company belongs to this enterprise
  const subCompany = await prisma.tenant.findFirst({
    where: { id, parentTenantId: tenantId },
    include: { _count: { select: { users: true, jobs: true } } },
  });

  if (!subCompany) {
    return res.status(404).json({ error: 'sub_company_not_found' });
  }

  // Don't allow deletion if there are jobs
  if (subCompany._count.jobs > 0) {
    return res.status(400).json({ error: 'sub_company_has_jobs' });
  }

  // Delete users first, then tenant
  await prisma.$transaction([
    prisma.user.deleteMany({ where: { tenantId: id } }),
    prisma.tenant.delete({ where: { id } }),
  ]);

  res.json({ success: true });
});

// Allocate credits to sub-company
const allocateCreditsSchema = z.object({
  credits: z.coerce.number().int().min(0),
});

router.post('/sub-companies/:id/allocate', requireEnterprise, requireTenantRole(['tenant_admin']), async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const settings = req.enterpriseSettings;
  const { id } = req.params;

  let body;
  try {
    body = allocateCreditsSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'validation_error', issues: err.issues });
    }
    throw err;
  }

  // Verify sub-company belongs to this enterprise
  const subCompany = await prisma.tenant.findFirst({
    where: { id, parentTenantId: tenantId },
  });

  if (!subCompany) {
    return res.status(404).json({ error: 'sub_company_not_found' });
  }

  // Calculate available credits
  const allSubCompanies = await prisma.tenant.findMany({
    where: { parentTenantId: tenantId },
    select: { id: true, allocatedCredits: true },
  });

  const totalAllocated = allSubCompanies.reduce((sum, s) => {
    // Exclude current sub-company from calculation
    if (s.id === id) return sum;
    return sum + (s.allocatedCredits ?? 0);
  }, 0);

  const maxAvailable = (settings?.totalVideoCredits ?? 0) - totalAllocated;

  if (body.credits > maxAvailable) {
    return res.status(400).json({
      error: 'insufficient_credits',
      maxAvailable,
      requested: body.credits,
    });
  }

  // Update allocation
  const updated = await prisma.tenant.update({
    where: { id },
    data: { allocatedCredits: body.credits },
  });

  res.json({
    id: updated.id,
    name: updated.name,
    allocatedCredits: updated.allocatedCredits ?? 0,
  });
});

// === Enterprise Users ===

// List all users in enterprise (including sub-companies)
router.get('/users', requireEnterprise, async (req: any, res) => {
  const tenantId = req.auth.tenantId;

  // Get sub-company IDs
  const subCompanies = await prisma.tenant.findMany({
    where: { parentTenantId: tenantId },
    select: { id: true, name: true },
  });

  const allTenantIds = [tenantId, ...subCompanies.map((s) => s.id)];
  const tenantNameMap = new Map<string, string>();
  tenantNameMap.set(tenantId, req.enterpriseTenant.name);
  subCompanies.forEach((s) => tenantNameMap.set(s.id, s.name));

  const users = await prisma.user.findMany({
    where: { tenantId: { in: allTenantIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      createdAt: true,
    },
  });

  res.json(
    users.map((u) => ({
      ...u,
      tenantName: tenantNameMap.get(u.tenantId) ?? 'Unknown',
      isMainEnterprise: u.tenantId === tenantId,
    })),
  );
});

// Invite user to enterprise or sub-company
const inviteUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['tenant_admin', 'user']).optional(),
  subCompanyId: z.string().optional(), // If not provided, adds to main enterprise
});

router.post('/users/invite', requireEnterprise, requireTenantRole(['tenant_admin']), async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const settings = req.enterpriseSettings;

  let body;
  try {
    body = inviteUserSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'validation_error', issues: err.issues });
    }
    throw err;
  }

  // Check email availability
  const existingUser = await prisma.user.findUnique({
    where: { email: body.email },
  });

  if (existingUser) {
    return res.status(400).json({ error: 'email_already_registered' });
  }

  // Determine target tenant
  let targetTenantId = tenantId;
  if (body.subCompanyId) {
    const subCompany = await prisma.tenant.findFirst({
      where: { id: body.subCompanyId, parentTenantId: tenantId },
    });
    if (!subCompany) {
      return res.status(404).json({ error: 'sub_company_not_found' });
    }
    targetTenantId = body.subCompanyId;
  }

  // Check user limit
  const subCompanies = await prisma.tenant.findMany({
    where: { parentTenantId: tenantId },
    select: { id: true },
  });
  const allTenantIds = [tenantId, ...subCompanies.map((s) => s.id)];

  const currentUserCount = await prisma.user.count({
    where: { tenantId: { in: allTenantIds } },
  });

  // +1 for the initial admin user
  const maxUsers = 1 + (settings?.maxAdditionalUsers ?? 0);
  if (currentUserCount >= maxUsers) {
    return res.status(400).json({ error: 'user_limit_reached' });
  }

  // Create user
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      emailVerifiedAt: new Date(),
      role: body.role ?? 'user',
      tenantId: targetTenantId,
    },
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  });
});

// Remove user from enterprise
router.delete('/users/:id', requireEnterprise, requireTenantRole(['tenant_admin']), async (req: any, res) => {
  const tenantId = req.auth.tenantId;
  const { id } = req.params;
  const currentUserId = req.auth.userId;

  // Don't allow self-deletion
  if (id === currentUserId) {
    return res.status(400).json({ error: 'cannot_delete_self' });
  }

  // Get sub-company IDs
  const subCompanies = await prisma.tenant.findMany({
    where: { parentTenantId: tenantId },
    select: { id: true },
  });
  const allTenantIds = [tenantId, ...subCompanies.map((s) => s.id)];

  // Find user
  const user = await prisma.user.findFirst({
    where: { id, tenantId: { in: allTenantIds } },
  });

  if (!user) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  await prisma.user.delete({ where: { id } });

  res.json({ success: true });
});

export default router;
