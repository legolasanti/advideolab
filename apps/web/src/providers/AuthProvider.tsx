import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';

type TenantInfo = {
  id: string;
  name: string;
  planCode?: string | null;
  planName?: string | null;
  resetDay?: number;
  status?: 'pending' | 'active' | 'suspended';
  paymentStatus?: 'payment_pending' | 'active_paid' | 'past_due';
  requestedPlanCode?: string | null;
  monthlyVideoLimit?: number | null;
  billingCycleStart?: string | null;
  nextBillingDate?: string | null;
  billingInterval?: 'monthly' | 'annual';
  subscriptionPeriodStart?: string | null;
  subscriptionPeriodEnd?: string | null;
  subscriptionCancelAt?: string | null;
  subscriptionCanceledAt?: string | null;
  defaultLogoPos?: string;
  defaultLogoScale?: number;
};

type AuthContextValue = {
  token: string | null;
  role: 'tenant_admin' | 'user' | 'owner_superadmin' | null;
  tenant?: TenantInfo;
  tenantStatus?: TenantInfo['status'];
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ role: AuthContextValue['role']; tenant?: TenantInfo | null }>;
  setSession: (session: { token: string; role?: AuthContextValue['role']; tenant?: TenantInfo | null }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => void;
  isOwner: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const bootstrapToken = () => {
  const params = new URLSearchParams(window.location.search);
  const impersonationToken = params.get('impersonationToken');
  if (impersonationToken) {
    localStorage.setItem('token', impersonationToken);
    params.delete('impersonationToken');
    const newUrl =
      window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
    return impersonationToken;
  }
  return localStorage.getItem('token');
};

export const getDashboardRoute = (role?: AuthContextValue['role'] | null) =>
  role === 'owner_superadmin' ? '/owner/tenants' : '/app';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(bootstrapToken);
  const [role, setRole] = useState<AuthContextValue['role']>(null);
  const [tenant, setTenant] = useState<TenantInfo | undefined>();
  const [loading, setLoading] = useState(!!token);
  const [isOwner, setIsOwner] = useState(false);

  const logout = useCallback(() => {
    api.post('/auth/logout', null, { skipAuthRefresh: true } as any).catch(() => undefined);
    localStorage.removeItem('token');
    setToken(null);
    setRole(null);
    setTenant(undefined);
    setIsOwner(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data } = await api.get('/auth/me');
      if (data.owner) {
        setRole('owner_superadmin');
        setIsOwner(true);
        setTenant(undefined);
      } else {
        setRole(data.user.role);
        setTenant(data.tenant ?? undefined);
        setIsOwner(false);
      }
    } catch (err) {
      console.error(err);
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout, token]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setRole(data.role);
    setTenant(data.tenant ?? undefined);
    setIsOwner(data.role === 'owner_superadmin');
    setLoading(false);
    return data;
  };

  const setSession = useCallback(
    async ({ token: sessionToken, role: sessionRole, tenant: sessionTenant }: { token: string; role?: AuthContextValue['role']; tenant?: TenantInfo | null }) => {
      localStorage.setItem('token', sessionToken);
      setToken(sessionToken);
      if (sessionRole) {
        setRole(sessionRole);
        setTenant(sessionTenant ?? undefined);
        setIsOwner(sessionRole === 'owner_superadmin');
        setLoading(false);
      } else {
        await refreshProfile();
      }
    },
    [refreshProfile],
  );

  return (
    <AuthContext.Provider
      value={{ token, role, tenant, tenantStatus: tenant?.status, login, setSession, refreshProfile, logout, loading, isOwner }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
};

export const useOptionalAuth = () => useContext(AuthContext);
