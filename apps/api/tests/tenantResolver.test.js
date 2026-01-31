"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tenantResolver_1 = require("../src/middleware/tenantResolver");
jest.mock('../src/lib/prisma', () => ({
    prisma: {
        tenant: {
        findUnique: jest.fn(async ({ where }) => ({
            id: where.id,
            name: 'Tenant 1',
            resetDay: 1,
            n8nBaseUrl: 'https://n8n',
            n8nProcessPath: '/hook',
                status: 'active',
            })),
        },
    },
}));
describe('tenantResolver', () => {
    it('loads tenant when auth contains tenantId', async () => {
        const req = { auth: { tenantId: 'tenant-123', role: 'tenant_admin' } };
        const next = jest.fn();
        await (0, tenantResolver_1.tenantResolver)(req, {}, next);
        expect(req.tenant?.id).toBe('tenant-123');
        expect(next).toHaveBeenCalled();
    });
    it('skips lookup for owner context', async () => {
        const req = { auth: { role: 'owner_superadmin' } };
        const next = jest.fn();
        await (0, tenantResolver_1.tenantResolver)(req, {}, next);
        expect(req.tenant).toBeUndefined();
    });
});
