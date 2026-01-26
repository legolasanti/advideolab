export type PlanCode = 'starter' | 'growth' | 'scale';

type PlanDefinition = {
  code: PlanCode;
  name: string;
  priceUsd: number;
  annualPriceUsd: number;
  monthlyEquivalentUsd: number;
  quota: number;
  description: string;
};

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  starter: {
    code: 'starter',
    name: 'Starter',
    priceUsd: 69,
    annualPriceUsd: 690,
    monthlyEquivalentUsd: 57.5,
    quota: 10,
    description: '10 videos / month',
  },
  growth: {
    code: 'growth',
    name: 'Growth',
    priceUsd: 179,
    annualPriceUsd: 1790,
    monthlyEquivalentUsd: 149.17,
    quota: 30,
    description: '30 videos / month',
  },
  scale: {
    code: 'scale',
    name: 'Scale',
    priceUsd: 499,
    annualPriceUsd: 4990,
    monthlyEquivalentUsd: 415.83,
    quota: 100,
    description: '100 videos / month',
  },
};

export const getPlanInfo = (code?: string | null) => {
  if (code && code in PLAN_DEFINITIONS) {
    return PLAN_DEFINITIONS[code as PlanCode];
  }
  return undefined;
};

export const formatPlanSummary = (
  code?: string | null,
  fallbackName?: string | null,
  fallbackQuota?: number | null,
) => {
  const info = getPlanInfo(code);
  if (info) {
    return `${info.name} · ${info.quota} videos/month`;
  }
  if (fallbackName && fallbackQuota) {
    return `${fallbackName} · ${fallbackQuota} videos/month`;
  }
  if (fallbackName) {
    return fallbackName;
  }
  return 'No plan assigned';
};
