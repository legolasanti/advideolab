const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
const data = JSON.parse(input);
const { prisma } = require('/app/dist/src/lib/prisma');

const run = async () => {
  for (const [section, entries] of Object.entries(data)) {
    for (const [key, value] of Object.entries(entries)) {
      await prisma.cmsContent.upsert({
        where: { section_key: { section, key } },
        update: { value },
        create: { section, key, value },
      });
    }
  }
};

run()
  .then(() => prisma.$disconnect())
  .then(() => console.log('cms synced'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
