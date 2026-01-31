import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const getCmsValue = async <T = unknown>(section: string, key: string, fallback?: T): Promise<T | undefined> => {
  const record = await prisma.cmsContent.findUnique({
    where: {
      section_key: {
        section,
        key,
      },
    },
  });
  return (record?.value as T | undefined) ?? fallback;
};

export const getCmsSection = async (section: string) => {
  const records = await prisma.cmsContent.findMany({ where: { section } });
  return records.reduce<Record<string, unknown>>((acc, record) => {
    acc[record.key] = record.value;
    return acc;
  }, {});
};

export const setCmsValue = async (section: string, key: string, value: unknown) => {
  const normalizedValue = value as Prisma.InputJsonValue;
  const record = await prisma.cmsContent.upsert({
    where: {
      section_key: {
        section,
        key,
      },
    },
    update: { value: normalizedValue },
    create: { section, key, value: normalizedValue },
  });
  return record;
};
