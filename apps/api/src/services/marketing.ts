import { prisma } from '../lib/prisma';
import { MarketingEventType } from '@prisma/client';

export type MarketingEventPayload = {
  eventType: MarketingEventType;
  sessionId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
};

const normalizeText = (value: string | null | undefined, max: number) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

export const trackMarketingEvent = async (payload: MarketingEventPayload) => {
  const sessionId = normalizeText(payload.sessionId, 128);
  if (!sessionId) return null;

  return prisma.marketingEvent.create({
    data: {
      eventType: payload.eventType,
      sessionId,
      tenantId: normalizeText(payload.tenantId, 64),
      userId: normalizeText(payload.userId, 64),
      utmSource: normalizeText(payload.utmSource, 128),
      utmMedium: normalizeText(payload.utmMedium, 128),
      utmCampaign: normalizeText(payload.utmCampaign, 128),
      referrer: normalizeText(payload.referrer, 2048),
      landingPage: normalizeText(payload.landingPage, 2048),
    },
  });
};
