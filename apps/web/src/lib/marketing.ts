import api from './api';

export type MarketingEventType =
  | 'visit'
  | 'signup_started'
  | 'signup_completed'
  | 'checkout_started'
  | 'payment_completed';

type MarketingAttribution = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
};

const SESSION_KEY = 'marketing_session_v1';
const ATTR_KEY = 'marketing_attribution_v1';
const SESSION_TTL_MS = 30 * 60 * 1000;

const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (_err) {
    return null;
  }
};

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mkt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

const getSession = () => {
  const now = Date.now();
  const existing = safeParse<{ id: string; lastSeen: number }>(localStorage.getItem(SESSION_KEY));
  if (!existing || now - existing.lastSeen > SESSION_TTL_MS) {
    const fresh = { id: createSessionId(), lastSeen: now };
    localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
    return fresh;
  }
  const updated = { ...existing, lastSeen: now };
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
};

const getAttribution = (): MarketingAttribution => safeParse<MarketingAttribution>(localStorage.getItem(ATTR_KEY)) ?? {};

const setAttribution = (next: MarketingAttribution) => {
  localStorage.setItem(ATTR_KEY, JSON.stringify(next));
};

export const captureAttributionFromUrl = () => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const current = getAttribution();
  const next: MarketingAttribution = { ...current };

  const utmSource = params.get('utm_source');
  const utmMedium = params.get('utm_medium');
  const utmCampaign = params.get('utm_campaign');

  if (utmSource) next.utmSource = utmSource;
  if (utmMedium) next.utmMedium = utmMedium;
  if (utmCampaign) next.utmCampaign = utmCampaign;

  if (!next.referrer && document.referrer) {
    next.referrer = document.referrer;
  }

  if (!next.landingPage) {
    next.landingPage = `${window.location.pathname}${window.location.search}`;
  }

  setAttribution(next);
};

export const getMarketingContext = () => {
  if (typeof window === 'undefined') {
    return { sessionId: null, ...getAttribution() };
  }
  const session = getSession();
  return {
    sessionId: session.id,
    ...getAttribution(),
  };
};

export const trackMarketingEvent = async (eventType: MarketingEventType, options?: { dedupe?: boolean }) => {
  if (typeof window === 'undefined') return;
  captureAttributionFromUrl();
  const context = getMarketingContext();

  if (!context.sessionId) return;

  const dedupe = options?.dedupe !== false;
  const dedupeKey = `marketing_event_${eventType}`;
  if (dedupe && sessionStorage.getItem(dedupeKey)) {
    return;
  }

  try {
    await api.post('/public/analytics/event', {
      eventType,
      sessionId: context.sessionId,
      utmSource: context.utmSource,
      utmMedium: context.utmMedium,
      utmCampaign: context.utmCampaign,
      referrer: context.referrer,
      landingPage: context.landingPage,
    });
    if (dedupe) {
      sessionStorage.setItem(dedupeKey, String(Date.now()));
    }
  } catch (err) {
    console.error('[marketing] event failed', err);
  }
};
