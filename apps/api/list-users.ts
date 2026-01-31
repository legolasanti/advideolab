
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- OWNERS ---');
    const owners = await prisma.owner.findMany();
    owners.forEach(o => {
        console.log(`Email: ${o.email}`);
    });

    console.log('\n--- USERS ---');
    const users = await prisma.user.findMany({
        include: { tenant: true },
    });
    users.forEach(u => {
        console.log(`Email: ${u.email}, Role: ${u.role}, Tenant: ${u.tenant?.name}`);
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
